// TODO: When releasing this to DefinitelyTyped, replace the following line with
// "Type definitions for XXX". Then delete this comment.
// -----------------------------------------------------------------------------
// vhtml 2.2.0 type definitions
// Project: https://github.com/developit/vhtml
// Definitions by: Yehyoung Kang <https://github.com/pastelmind/>

export = vhtml;

/**
 * Converts Hyperscript/JSX to a plain string.
 * @param name Element name
 * @param attrs Attributes
 * @param children Child elements
 */
declare function vhtml(
  name: string,
  attrs?: (VhtmlAttributes & { [prop: string]: string }) | null,
  ...children: any[]
): string;

/**
 * Converts Hyperscript/JSX to a plain string.
 * @param name Element name
 * @param attrs Attributes
 * @param children Child elements
 */
declare function vhtml<T extends keyof JSX.IntrinsicElements>(
  name: T,
  attrs?: JSX.IntrinsicElements[T] | null,
  ...children: any[]
): string;

/**
 * Converts Hyperscript/JSX to a plain string.
 * @param component Functional pseudo-component
 * @param attrs Attributes
 * @param children Child elements
 */
declare function vhtml<Props extends VhtmlAttributes>(
  component: (props: Props) => string,
  attrs?: Props | null,
  ...children: any[]
): string;

interface VhtmlAttributes {
  children?: any[];
  dangerouslySetInnerHTML?: { __html: string };
  [attr: string]: any;
}
