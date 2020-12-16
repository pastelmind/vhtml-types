# vhtml-types

This project provides TypeScript type definitions (`.d.ts`) for [vhtml](https://github.com/developit/vhtml). It generates type definitions for JSX by extracting and transforming interfaces from [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts).

## Installation and Usage

NOTE: This type definition has been submitted to [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/50147) and is awaiting approval. The following instructions are meant to be a temporary measure.

First, install vhtml and vhtml-types.

```
npm install -D vhtml @pastelmind/vhtml-types
```

Next, add the following line to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "paths": {
      // Add this
      "vhtml": ["./node_modules/@pastelmind/vhtml-types"]
    }
  }
}
```

This allows you to use vhtml and enjoy the benefits of type-checking your JSX expressions.

Note: This type definition may clash with other libraries and frameworks that bring their own JSX type definitions, e.g. React. I have not tested what happens when both vhtml and React is use together. Use with caution!

## Building

First, install the necessary packages:

```
npm install
```

Then generate the type definitions for vhtml:

```
npm run build
```

Finally, test the generated type definitions:

```
npm run test
```
