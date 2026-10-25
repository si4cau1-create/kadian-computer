/* 全局配置：学科定义、AI 服务商预设、角色提示词 */
var CONFIG = (function () {
  var SUBJECTS = [
    { id: 'math', name: '数学', color: '#378ADD' },
    { id: 'physics', name: '物理', color: '#1D9E75' },
    { id: 'chemistry', name: '化学', color: '#D85A30' },
    { id: 'biology', name: '生物', color: '#639922' },
    { id: 'japanese', name: '日语', color: '#7F77DD' },
    { id: 'english', name: '英语', color: '#D4537E' },
    { id: 'chinese', name: '语文', color: '#BA7517' },
    { id: 'other', name: '其他', color: '#888780' }
  ];

  /* 学科角色：决定讲解的口吻与结构 */
  var ROLES = {
    math: '你是一名广东高中数学教师。擅长把抽象的推导步骤拆开讲清楚，公式一律用 LaTeX 书写，不要跳步。',
    physics: '你是一名广东高中物理教师。擅长用最少的文字建立物理图像（研究对象、过程、条件），公式用 LaTeX，必须点明适用条件。',
    chemistry: '你是一名广东高中化学教师。术语严格贴近教材，化学式用 LaTeX 写成 \\mathrm{H_2SO_4} 这种形式，方程式必须带条件和现象。',
    biology: '你是一名广东高中生物教师。术语必须与教材表述一致，过程按"条件 → 步骤 → 结果"叙述，不做教材外的引申。',
    japanese: '你是一名日语教师。用中文讲解，日语例句给出日文原文并附中文翻译；语法点必须说明接续方式、使用限制和常见误用。',
    english: '你是一名英语教师。用中文讲解，例句给出英文原文并附中文翻译；语法从句子结构与成分入手，说明语域与搭配。',
    chinese: '你是一名语文教师。用中文讲解，文言文按"字词 → 句式 → 语境"三层拆解，古今异义要标出。',
    other: '你是一位耐心的私人老师。用中文讲解，直击卡点本身，不铺陈无关内容。'
  };

  /* AI 服务商预设：base_url 与模型名按官方文档为准，模型名可自行修改 */
  var AI_PRESETS = [
    {
      id: 'deepseek', name: 'DeepSeek（国内直连，最便宜）',
      baseUrl: 'https://api.deepseek.com/v1',
      textModel: 'deepseek-chat', visionModel: '',
      note: 'DeepSeek 目前不支持读图。若要用拍照功能，需另配一个视觉模型（如豆包 vision / 通义 qwen-vl / 硅基流动 VL）。',
      doc: 'https://platform.deepseek.com'
    },
    {
      id: 'doubao', name: '豆包（火山方舟）',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      textModel: 'doubao-seed-1-6', visionModel: 'doubao-seed-1-6-vision',
      note: '自带读图模型，国内直连。模型名以控制台实际开通的为准。',
      doc: 'https://console.volcengine.com/ark'
    },
    {
      id: 'qwen', name: '通义千问（阿里 DashScope）',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      textModel: 'qwen-plus', visionModel: 'qwen-vl-plus',
      note: '自带 qwen-vl 视觉模型，公式识别较好。',
      doc: 'https://bailian.console.aliyun.com'
    },
    {
      id: 'kimi', name: 'Kimi（Moonshot）',
      baseUrl: 'https://api.moonshot.cn/v1',
      textModel: 'moonshot-v1-32k', visionModel: '',
      note: '长文本强，读图能力需另行确认。',
      doc: 'https://platform.moonshot.cn'
    },
    {
      id: 'siliconflow', name: '硅基流动 SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      textModel: 'Qwen/Qwen2.5-7B-Instruct', visionModel: 'Qwen/Qwen2.5-VL-7B-Instruct',
      note: '可同时用云端大模型和开源视觉模型，按量计费。',
      doc: 'https://cloud.siliconflow.cn'
    },
    {
      id: 'ollama', name: '本地 Ollama / llama.cpp（离线）',
      baseUrl: 'http://127.0.0.1:11434/v1',
      textModel: 'qwen2.5:7b', visionModel: 'qwen2.5vl:7b',
      note: '完全离线，注意：手机访问不到电脑的 127.0.0.1，需填电脑局域网 IP。',
      doc: 'https://ollama.com'
    },
    {
      id: 'openai', name: 'OpenAI（需代理）',
      baseUrl: 'https://api.openai.com/v1',
      textModel: 'gpt-4o-mini', visionModel: 'gpt-4o-mini',
      note: '国内直连需代理；你的 Chrome 已配 mihomo，但命令行/手机不走系统代理。',
      doc: 'https://platform.openai.com'
    },
    {
      id: 'custom', name: '自定义（任何 OpenAI 兼容接口）',
      baseUrl: '', textModel: '', visionModel: '',
      note: '填入 base_url、模型名即可。接口需兼容 POST {base_url}/chat/completions。',
      doc: ''
    }
  ];

  function subject(id) {
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].id === id) return SUBJECTS[i];
    return SUBJECTS[SUBJECTS.length - 1];
  }
  function subjectName(id) { return subject(id).name; }
  function role(id) { return ROLES[id] || ROLES.other; }
  function preset(id) {
    for (var i = 0; i < AI_PRESETS.length; i++) if (AI_PRESETS[i].id === id) return AI_PRESETS[i];
    return null;
  }

  return {
    SUBJECTS: SUBJECTS,
    AI_PRESETS: AI_PRESETS,
    subject: subject,
    subjectName: subjectName,
    role: role,
    preset: preset
  };
})();
