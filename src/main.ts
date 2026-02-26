/**
 * @fileoverview 应用程序入口文件
 *
 * 本文件是 Vue 应用的启动入口点，负责：
 * - 注册日志解析器
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

// 导入解析器注册相关模块
import { parserRegistry } from "./domains/logs/parsers/registry";
import { maaEndParser, maaEndAuxParser } from "./domains/logs/parsers/maaend";
import { loguruParser, loguruAuxParser } from "./domains/logs/parsers/m9a";
import { ParserPriority } from "./domains/logs/parsers/types";

// 注册文件解析器（用于自动检测文件类型）
// 按优先级注册：MaaEnd 解析器优先级最高，Loguru 解析器次之
parserRegistry.register(maaEndParser, ParserPriority.HIGH);
parserRegistry.register(loguruParser, ParserPriority.MEDIUM);

// 注册辅助日志解析器（用于 UI 选择）
parserRegistry.registerAuxParser(maaEndAuxParser);
parserRegistry.registerAuxParser(loguruAuxParser);

// 创建 Vue 应用实例并挂载到 #app 元素
createApp(App).mount("#app");
