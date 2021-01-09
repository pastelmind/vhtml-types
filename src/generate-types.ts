/**
 * @file Script that generates JSX type definitions for @types/vhtml, using
 * @types/react.
 */

import { strict as assert } from "assert";

import {
  InterfaceDeclaration,
  Node,
  Project,
  SourceFile,
  StatementedNode,
  TypeAliasDeclaration,
} from "ts-morph";

/**
 * Normalizes attribute types
 * @param attrType
 * @returns Normalized type string
 */
function normalizeAttributeType(attrType: string): string {
  // vhtml doesn't support event handler functions --everything is serialized to
  // string
  if (/EventHandler/i.test(attrType)) return "string";

  // vhtml does not have a distinct node type. If a component is an HTML tag,
  // all children are converted to strings and concatenated.
  if (attrType === "ReactNode") return "any";

  // vhtml doesn't convert style objects to string, so CSSProperties isn't
  // supported.
  // Also replace Booleanish with inline type union
  return attrType
    .replace(/\bCSSProperties\b/g, "string")
    .replace(/\bBooleanish\b/g, "(boolean | 'true' | 'false')");
}

/**
 * Recursively retrieves all interfaces and type aliases under a node.
 * @param node Source file or namespace/module declaration
 * @returns Flattened array of all interfaces and type aliases
 */
function getAllInterfacesAndTypeAliases(
  node: StatementedNode
): (InterfaceDeclaration | TypeAliasDeclaration)[] {
  type InterfaceOrTypeAlias = InterfaceDeclaration | TypeAliasDeclaration;

  return node
    .getStatementsWithComments()
    .reduce((accr: InterfaceOrTypeAlias[], c) => {
      if (Node.isInterfaceDeclaration(c) || Node.isTypeAliasDeclaration(c)) {
        accr.push(c);
      } else if (Node.isStatementedNode(c)) {
        accr.push(...getAllInterfacesAndTypeAliases(c));
      }
      return accr;
    }, []);
}

/**
 * Convert an attributes interface from @types/react for our own use.
 * @param interfaceNode Interface node to convert
 */
function updateAttributesInterface(
  interfaceNode: InterfaceDeclaration
): InterfaceDeclaration {
  // Delete all type prameters
  interfaceNode
    .getTypeParameters()
    .forEach((typeParameter) => typeParameter.remove());

  // Erase type parameters in extends expressions
  interfaceNode.getExtends().forEach((extendsExpr) => {
    const exprText = extendsExpr.getExpression().getText();

    // Remove blacklisted interfaces
    if (exprText === "ClassAttributes") {
      interfaceNode.removeExtends(extendsExpr);
      return;
    }

    assert(
      exprText === "AriaAttributes" ||
        exprText === "DOMAttributes" ||
        exprText === "HTMLAttributes" ||
        exprText === "MediaHTMLAttributes" ||
        exprText === "SVGAttributes",
      `Interface ${interfaceNode.getName()} has unexpected parent interface: ${exprText}`
    );

    interfaceNode.removeExtends(extendsExpr);
    // Remove generic type parameter (<T>)
    interfaceNode.addExtends(exprText);
  });

  // Process properties
  interfaceNode.getProperties().forEach((propertySignature) => {
    const propName = propertySignature.getName();

    // Delete React-specific properties unsupported by vhtml
    if (
      propName === "defaultChecked" ||
      propName === "defaultValue" ||
      propName === "suppressContentEditableWarning" ||
      propName === "suppressHydrationWarning"
    ) {
      propertySignature.remove();
      return;
    }

    const structure = propertySignature.getStructure();

    // Normalize types
    assert(
      typeof structure.type === "string",
      `Unexpected structure.type type: ${structure.type}`
    );
    if (propName !== "dangerouslySetInnerHTML") {
      structure.type = normalizeAttributeType(structure.type);
    }

    // Convert property names to lowercase, unless it is one of the special
    // property names supported by vhtml
    assert.equal(structure.name, propName);
    if (
      propName !== "className" &&
      propName !== "dangerouslySetInnerHTML" &&
      propName !== "htmlFor"
    ) {
      structure.name = propName.toLowerCase();
    }

    propertySignature.set(structure);

    // If a property name is one of the special alised attributes names,
    // add a copy of the property under the original attribute name.
    if (propName === "className") {
      interfaceNode.addProperty({ ...structure, name: "class" });
    } else if (propName === "htmlFor") {
      interfaceNode.addProperty({ ...structure, name: "for" });
    }
  });

  return interfaceNode;
}

/**
 * Extracts the `IntrinsicElements` interface, as well as a set of interface
 * names used by properties of the `IntrinsicElements` interface.
 * @param node TypeScript node that contains the `IntrinsicElements` interface
 *    somewhere inside
 * @returns A tuple of `[interfaceNode, Array of interface names]`.
 */
function extractIntrinsicElementsInterface(
  sourceFile: SourceFile
): [InterfaceDeclaration, Set<string>] {
  const intrinsicElementsInterface = sourceFile
    .getNamespaceOrThrow("global")
    .getNamespaceOrThrow("JSX")
    .getInterfaceOrThrow("IntrinsicElements");

  const propertyInterfaceNames = new Set<string>();
  intrinsicElementsInterface.getProperties().forEach((propertySignature) => {
    const typeNode = propertySignature.getTypeNodeOrThrow();

    // Convert properties that look like:
    //    property: React.DetailedHTMLProps<React.XXX<SomeElement>, SomeElement>;
    // to
    //    property: XXX;
    //
    // Also, convert SVG properties
    //    property: React.SVGProps<SomeElement>;
    // to
    //    property: SVGProps;

    let targetInterfaceIdentifier = typeNode.forEachDescendant(
      (node) =>
        Node.isQualifiedName(node) &&
        node.getLeft().getText() === "React" &&
        Node.isIdentifier(node.getRight()) &&
        node.getRight().getText() !== "DetailedHTMLProps" &&
        node.getRight()
    );
    assert(targetInterfaceIdentifier, "Cannot find target identifier");

    // Use `XXX` as the new type for the property
    propertyInterfaceNames.add(targetInterfaceIdentifier.getText());
    propertySignature.setType(targetInterfaceIdentifier.getText());
  });

  return [intrinsicElementsInterface, propertyInterfaceNames];
}

/**
 * Extracts JSX type definitions from @types/react and merges it with a
 * predefined type definition file for vhtml.
 * @param inputTypesFile Path to input type definition file
 * @param reactTypesFile Path to React's type definition file
 * @param outputTypesFile Path to save the output type definition file
 */
function generateJsxTypesForVhtml(
  inputTypesFile: string,
  reactTypesFile: string,
  outputTypesFile: string
): void {
  const project = new Project();
  const inputSourceFile = project.addSourceFileAtPath(inputTypesFile);
  const reactSourceFile = project.addSourceFileAtPath(reactTypesFile);

  // Since extracting interfaces from reactSourceFile takes very long, let's do
  // this first so that we can fail fast if the input source file doesn't have
  // `global.JSX`.
  const inputJsxNamespace = inputSourceFile
    .getNamespaceOrThrow("global")
    .getNamespaceOrThrow("JSX");

  const extractedInterfaceNodes: (
    | InterfaceDeclaration
    | TypeAliasDeclaration
  )[] = [];

  // First pass:
  // Extract the IntrinsicElements interface and a set of additional type names
  // that we need
  console.log(`Extracting JSX.IntrinsicElements...`);

  const [
    intrinsicElementsInterface,
    typeNamesToExtract,
  ] = extractIntrinsicElementsInterface(reactSourceFile);

  // Interfaces and type aliases that should always be included
  typeNamesToExtract.add("AriaAttributes");
  typeNamesToExtract.add("DOMAttributes");
  typeNamesToExtract.add("HTMLAttributeReferrerPolicy");
  typeNamesToExtract.add("HTMLAttributes");
  typeNamesToExtract.add("MediaHTMLAttributes");
  typeNamesToExtract.add("SVGAttributes");

  // Second pass:
  // Extract all interfaces that we are interested in
  console.log(`Extracting ${typeNamesToExtract.size} interfaces/types...`);

  const allInterfacesAndTypeAliases = getAllInterfacesAndTypeAliases(
    reactSourceFile
  );
  for (const n of allInterfacesAndTypeAliases) {
    if (
      (Node.isInterfaceDeclaration(n) || Node.isTypeAliasDeclaration(n)) &&
      typeNamesToExtract.has(n.getName())
    ) {
      if (Node.isInterfaceDeclaration(n)) {
        const updatedInterfaceNode = updateAttributesInterface(n);
        extractedInterfaceNodes.push(updatedInterfaceNode);
      } else {
        extractedInterfaceNodes.push(n);
      }

      process.stdout.write(".");
    }
  }

  console.log();
  console.log(`Buildng type definition file...`);

  inputJsxNamespace.addInterface(intrinsicElementsInterface.getStructure());
  extractedInterfaceNodes.forEach((node) => {
    if (Node.isInterfaceDeclaration(node)) {
      // If the interface has no properties, convert it to a type alias, using
      // an intersection of all of its extends expressions.
      // (tslint: no-empty-interface)
      if (node.getProperties().length === 0) {
        inputJsxNamespace.addTypeAlias({
          name: node.getName(),
          type: node
            .getExtends()
            .map((e) => `(${e.getText()})`)
            .join("&"),
        });
      } else {
        inputJsxNamespace.addStatements(node.getText());
      }
    } else {
      inputJsxNamespace.addStatements(node.getText());
    }
  });

  console.log(`Writing to ${outputTypesFile}...`);

  const outputSourceFile = project.createSourceFile(
    outputTypesFile,
    inputSourceFile.getFullText(),
    { overwrite: true }
  );
  outputSourceFile.formatText();
  outputSourceFile.saveSync();
}

if (require.main === module) {
  generateJsxTypesForVhtml(
    "input/vhtml.d.ts",
    "node_modules/@types/react/index.d.ts",
    "types/index.d.ts"
  );
}
