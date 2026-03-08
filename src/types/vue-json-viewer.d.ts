declare module "vue-json-viewer" {
  import { DefineComponent } from "vue";

  interface JsonViewerProps {
    value: unknown;
    expandDepth?: number;
    copyable?: boolean | { copyText?: string; copiedText?: string; timeout?: number };
    sort?: boolean;
    boxed?: boolean;
    theme?: string;
    expanded?: boolean;
    timeformat?: (time: Date) => string;
    previewMode?: boolean;
    showArrayIndex?: boolean;
    showDoubleQuotes?: boolean;
  }

  const JsonViewer: DefineComponent<JsonViewerProps>;
  export default JsonViewer;
}
