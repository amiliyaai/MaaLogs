/**
 * @fileoverview MAA 框架知识库
 *
 * 包含识别算法、动作类型、控制器等相关知识
 * 用于 AI 分析时的参考
 *
 * @module config/knowledge
 */

export interface KnowledgeItem {
  desc: string;
  params?: string[];
  failures?: string[];
  suggestions?: string[];
}

export interface RecognitionKnowledge {
  [key: string]: KnowledgeItem;
}

export interface ActionKnowledge {
  [key: string]: KnowledgeItem;
}

export interface ControllerKnowledge {
  [key: string]: {
    desc: string;
    screencap?: string[];
    input?: string[];
  };
}

export interface MAAKnowledgeBase {
  recognition: RecognitionKnowledge;
  actions: ActionKnowledge;
  controllers: ControllerKnowledge;
  common: {
    [key: string]: {
      failures?: string[];
      suggestions?: string[];
    };
  };
}

export const MAA_KNOWLEDGE: MAAKnowledgeBase = {
  recognition: {
    DirectHit: {
      desc: "直接命中，不进行识别，直接执行动作",
      failures: [],
      suggestions: [],
    },
    TemplateMatch: {
      desc: "模板匹配，在屏幕中查找与模板相似的区域",
      params: ["template", "threshold", "roi", "method", "green_mask"],
      failures: [
        "模板图片过时，与当前界面差异大",
        "阈值(threshold)设置过高",
        "分辨率变化导致模板比例不匹配",
        "绿色蒙版(green_mask)区域设置不当",
      ],
      suggestions: [
        "更新模板图片为当前最新",
        "适当降低匹配阈值（0.7~0.8）",
        "确认分辨率是否为 720p (1280x720)",
        "减少不必要的 green_mask 区域",
      ],
    },
    FeatureMatch: {
      desc: "特征匹配，抗透视和尺寸变化",
      params: ["template", "count", "detector"],
      failures: ["模板特征点过少（建议 64x64 以上）", "特征检测器不支持", "重复纹理导致误匹配"],
      suggestions: ["使用纹理丰富的模板", "使用 SIFT 检测器提高精度", "减少重复纹理区域"],
    },
    ColorMatch: {
      desc: "颜色匹配，根据颜色判断",
      params: ["lower", "upper", "method"],
      failures: ["颜色阈值过窄", "光线变化导致颜色偏差", "颜色范围 lower/upper 设置错误"],
      suggestions: ["使用 RGB 范围而非单一颜色", "增加颜色容差", "调整 lower/upper 范围"],
    },
    OCR: {
      desc: "光学字符识别，识别屏幕文字",
      params: ["expected", "model", "with_prob"],
      failures: [
        "文字区域为空或无文字",
        "文字模糊不清晰",
        "字体不支持或语言包缺失",
        "expected 参数设置错误",
        "best 为 null，filtered 为空数组",
      ],
      suggestions: [
        "检查文字是否存在",
        "提高截图质量/分辨率",
        "尝试其他 OCR 参数",
        "确认 expected 文字是否正确",
        "检查 ROI 区域是否正确",
      ],
    },
    NeuralNetworkClassify: {
      desc: "深度学习分类",
      params: ["model", "expected", "threshold"],
      failures: ["模型加载失败", "分类阈值过高", "输入图像异常"],
      suggestions: ["检查模型文件", "降低阈值", "检查输入图像"],
    },
    NeuralNetworkDetect: {
      desc: "深度学习目标检测",
      params: ["model", "expected", "threshold"],
      failures: ["模型加载失败", "检测阈值过高", "无检测结果"],
      suggestions: ["检查模型文件", "降低阈值", "检查目标是否存在"],
    },
    Custom: {
      desc: "自定义识别，由 Go Service 处理",
      params: ["custom_recognition"],
      failures: ["Go Service 未启动或崩溃", "自定义识别逻辑执行异常", "参数传递错误"],
      suggestions: ["检查 Go Service 状态", "查看自定义识别日志", "确认参数格式正确"],
    },
    And: {
      desc: "多算法组合识别，全部成功才算成功",
      params: ["recogs", "roi"],
      failures: [
        "子算法识别失败，导致整体失败",
        "多线程日志交错导致识别状态异常",
        "ROI 区域设置不当导致子算法无法匹配",
      ],
      suggestions: [
        "逐个检查各子算法的识别结果",
        "增加识别重试间隔，避免界面动画导致失败",
        "确认 ROI 区域覆盖所有子算法目标",
        "查看 recognition_attempts 了解各子算法详情",
      ],
    },
    Or: {
      desc: "多算法组合识别，任一成功就算成功",
      params: ["recogs", "roi"],
      failures: ["所有子算法都未能成功匹配"],
      suggestions: [
        "检查各子算法的阈值设置",
        "更新各子算法的模板/参数",
        "考虑增加更多备选识别方案",
      ],
    },
  },
  actions: {
    DoNothing: { desc: "不执行任何操作", failures: [], suggestions: [] },
    Click: {
      desc: "点击指定坐标或区域",
      params: ["target", "target_offset", "contact", "pressure"],
      failures: [
        "坐标超出屏幕范围",
        "点击无响应（设备问题）",
        "target 引用了不存在的节点",
        "目标区域被遮挡",
      ],
      suggestions: [
        "检查坐标是否在屏幕范围内",
        "检查设备连接状态",
        "确认 target 节点是否存在",
        "检查目标是否在可点击状态",
      ],
    },
    LongPress: {
      desc: "长按",
      params: ["target", "duration", "contact"],
      failures: [
        "长按时间过短，未触发效果",
        "目标位置不正确",
        "目标区域偏移",
      ],
      suggestions: [
        "增加 duration 时间（建议 500ms 以上）",
        "检查 target 坐标是否正确",
        "确认 target_offset 设置",
      ],
    },
    Swipe: {
      desc: "滑动",
      params: ["begin", "end", "duration", "end_hold"],
      failures: [
        "滑动距离过短",
        "滑动速度过快",
        "滑动未达到预期效果",
      ],
      suggestions: [
        "调整 begin/end 坐标",
        "增加 duration 时间",
        "确认滑动方向正确",
      ],
    },
    MultiSwipe: {
      desc: "多指滑动",
      params: ["swipes"],
      failures: [
        "多点触控不支持",
        "手势参数错误",
        "各手指滑动不同步",
      ],
      suggestions: [
        "检查设备是否支持多点触控",
        "验证 swipes 参数格式",
        "减少手指数量尝试",
      ],
    },
    ClickKey: {
      desc: "按键",
      params: ["key"],
      failures: [
        "按键码无效",
        "按键无响应",
        "应用不支持该按键",
      ],
      suggestions: [
        "检查 key 值是否正确",
        "确认应用支持该按键",
        "尝试使用其他方式（如点击）",
      ],
    },
    InputText: {
      desc: "输入文本",
      params: ["input_text"],
      failures: [
        "输入框未获得焦点",
        "文本编码问题",
        "特殊字符输入失败",
      ],
      suggestions: [
        "先点击输入框获取焦点",
        "检查文本编码",
        "分多次输入长文本",
      ],
    },
    StartApp: {
      desc: "启动应用",
      params: ["package"],
      failures: [
        "应用包名错误",
        "应用未安装",
        "应用启动缓慢或无响应",
      ],
      suggestions: [
        "确认 package 名称正确",
        "检查应用是否已安装",
        "增加启动等待时间",
      ],
    },
    StopApp: {
      desc: "停止应用",
      params: ["package"],
      failures: [
        "应用包名错误",
        "应用未运行",
        "停止应用权限不足",
      ],
      suggestions: [
        "确认 package 名称正确",
        "检查应用是否在运行",
        "使用 force stop 参数",
      ],
    },
    Command: {
      desc: "执行外部命令",
      params: ["exec", "args"],
      failures: [
        "命令不存在",
        "执行权限不足",
        "命令执行超时",
      ],
      suggestions: [
        "检查命令路径",
        "确认执行权限",
        "增加超时时间",
      ],
    },
    Shell: {
      desc: "执行 ADB Shell",
      params: ["cmd"],
      failures: [
        "ADB 命令错误",
        "设备未连接",
        "Shell 命令权限不足",
      ],
      suggestions: [
        "检查 cmd 语法",
        "确认 ADB 连接正常",
        "使用 root 权限执行",
      ],
    },
    Custom: {
      desc: "自定义动作",
      params: ["custom_action"],
      failures: [
        "Go Service 未启动",
        "自定义动作执行异常",
        "动作参数传递错误",
      ],
      suggestions: [
        "检查 Go Service 日志",
        "确认动作已注册",
        "检查动作参数格式",
      ],
    },
    Sleep: {
      desc: "等待一段时间",
      params: ["duration"],
      failures: ["等待时间设置过长", "等待被中断"],
      suggestions: ["适当缩短等待时间", "检查是否有中断逻辑"],
    },
    Wait: {
      desc: "等待直到条件满足",
      params: ["target", "timeout"],
      failures: [
        "等待超时",
        "目标状态始终未满足",
        "超时时间设置过短",
      ],
      suggestions: [
        "增加超时时间",
        "检查目标识别条件",
        "确认等待逻辑是否正确",
      ],
    },
  },
  controllers: {
    adb: {
      desc: "Android Debug Bridge，连接安卓设备/模拟器",
      screencap: ["EncodeToFileAndPull", "Encode", "RawWithGzip", "MinicapDirect", "MinicapStream"],
      input: ["AdbShell", "Minitouch", "Maatouch"],
    },
    win32: {
      desc: "Windows 窗口控制",
      screencap: ["FramePool", "PrintWindow", "GDI", "DXGI"],
      input: ["Seize", "SendMessage", "PostMessage"],
    },
    PlayCover: {
      desc: "iOS 模拟器控制",
    },
  },
  common: {
    connection: {
      failures: [
        "ADB 设备未连接或连接断开",
        "WiFi ADB IP 地址变更",
        "USB 调试授权撤销",
        "模拟器未启动或崩溃",
      ],
      suggestions: [
        "检查设备连接状态（adb devices）",
        "重新连接 WiFi ADB",
        "重新授权 USB 调试",
        "重启模拟器",
      ],
    },
    recognition_timeout: {
      failures: [
        "识别耗时过长导致超时",
        "设备性能不足",
        "截图文件过大",
        "识别算法复杂度高",
      ],
      suggestions: [
        "优化 ROI 区域减少识别范围",
        "简化识别算法",
        "降低截图分辨率",
        "增加超时时间限制",
      ],
    },
    node_disabled: {
      failures: [
        "节点被主动禁用",
        "前置条件未满足",
        "任务流程跳过",
      ],
      suggestions: [
        "检查节点禁用原因",
        "确认任务流程是否正确",
        "查看完整的任务执行日志",
      ],
    },
    action_timeout: {
      failures: [
        "动作执行超时",
        "设备响应慢",
        "动作参数不正确",
      ],
      suggestions: [
        "增加动作超时时间",
        "检查设备性能",
        "验证动作参数是否正确",
      ],
    },
  },
};
