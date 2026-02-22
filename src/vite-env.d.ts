/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "vue-virtual-scroller" {
  import type { DefineComponent } from "vue";
  export const DynamicScroller: DefineComponent;
  export const DynamicScrollerItem: DefineComponent;
  export const RecycleScroller: DefineComponent;
}
