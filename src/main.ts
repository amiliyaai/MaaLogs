/**
 * @fileoverview 应用程序入口文件
 *
 * 本文件是 Vue 应用的启动入口点，负责：
 * - 注册项目解析器
 * - 创建 Vue 应用实例
 * - 挂载应用到 DOM
 *
 * @module main
 * @author MaaLogs Team
 * @license MIT
 */

import { createApp } from "vue";
import App from "./App.vue";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";

// 导入项目解析器注册相关模块
import { projectParserRegistry } from "./parsers/project-registry";
import { m9aProjectParser } from "./parsers/projects/m9a";
import { maaEndProjectParser } from "./parsers/projects/maaend";

// 注册项目解析器
// M9A 优先级更高，因为它的检测更精确
projectParserRegistry.register(m9aProjectParser, 100);
projectParserRegistry.register(maaEndProjectParser, 50);

// 创建 Vue 应用实例并挂载到 #app 元素
createApp(App).mount("#app");
