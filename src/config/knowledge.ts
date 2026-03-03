/**
 * @fileoverview MAA 框架知识库配置
 *
 * 包含识别算法、动作类型、控制器等相关知识
 * 用于 AI 分析时的检索增强
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
      failures: ["颜色阈值过窄", "偏差", "颜色范围(光照变化导致颜色lower/upper)设置错误"],
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
      ],
      suggestions: [
        "检查文字是否存在",
        "提高截图质量/分辨率",
        "尝试其他 OCR 参数",
        "确认 expected 文字是否正确",
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
  },
  actions: {
    DoNothing: { desc: "不执行任何操作", failures: [], suggestions: [] },
    Click: {
      desc: "点击指定坐标或区域",
      params: ["target", "target_offset", "contact", "pressure"],
      failures: ["坐标超出屏幕范围", "点击无响应（设备问题）", "target 引用了不存在的节点"],
      suggestions: ["检查坐标是否在屏幕范围内", "检查设备连接状态", "确认 target 节点是否存在"],
    },
    LongPress: {
      desc: "长按",
      params: ["target", "duration", "contact"],
      failures: ["长按时间过短", "目标位置不正确"],
      suggestions: ["增加 duration 时间", "检查 target 坐标"],
    },
    Swipe: {
      desc: "滑动",
      params: ["begin", "end", "duration", "end_hold"],
      failures: ["滑动距离过短", "滑动速度过快"],
      suggestions: ["调整 begin/end 坐标", "增加 duration 时间"],
    },
    MultiSwipe: {
      desc: "多指滑动",
      params: ["swipes"],
      failures: ["多点触控不支持", "手势参数错误"],
      suggestions: ["检查设备是否支持多点触控", "验证 swipes 参数格式"],
    },
    ClickKey: {
      desc: "按键",
      params: ["key"],
      failures: ["按键码无效", "按键无响应"],
      suggestions: ["检查 key 值是否正确", "确认应用支持该按键"],
    },
    InputText: {
      desc: "输入文本",
      params: ["input_text"],
      failures: ["输入框未获得焦点", "文本编码问题"],
      suggestions: ["先点击输入框获取焦点", "检查文本编码"],
    },
    StartApp: {
      desc: "启动应用",
      params: ["package"],
      failures: ["应用包名错误", "应用未安装"],
      suggestions: ["确认 package 名称正确", "检查应用是否已安装"],
    },
    StopApp: {
      desc: "停止应用",
      params: ["package"],
      failures: ["应用包名错误", "应用未运行"],
      suggestions: ["确认 package 名称正确", "检查应用是否在运行"],
    },
    Command: {
      desc: "执行外部命令",
      params: ["exec", "args"],
      failures: ["命令不存在", "执行权限不足"],
      suggestions: ["检查命令路径", "确认执行权限"],
    },
    Shell: {
      desc: "执行 ADB Shell",
      params: ["cmd"],
      failures: ["ADB 命令错误", "设备未连接"],
      suggestions: ["检查 cmd 语法", "确认 ADB 连接正常"],
    },
    Custom: {
      desc: "自定义动作",
      params: ["custom_action"],
      failures: ["Go Service 未启动", "自定义动作执行异常"],
      suggestions: ["检查 Go Service 日志", "确认动作已注册"],
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
};
