export const MAAEND_LOG_SAMPLES = {
  recognitionStarting: `[2026-02-25 09:16:31.781][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Recognition.Starting] [details={"focus":null,"name":"ScenePrivateAnyEnterWorldSuccess","reco_id":400000006,"task_id":200000001}]`,

  recognitionSucceeded: `[2026-02-25 09:16:31.761][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Recognition.Succeeded] [details={"focus":null,"name":"SceneAnyEnterWorld","reco_details":{"algorithm":"DirectHit","box":[0,0,0,0],"detail":null,"name":"SceneAnyEnterWorld","reco_id":400000005},"task_id":200000001}]`,

  recognitionFailed: `[2026-02-25 09:16:31.805][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Recognition.Failed] [details={"focus":null,"name":"ScenePrivateAnyEnterWorldSuccess","reco_details":{"algorithm":"And","box":null,"detail":[],"name":"ScenePrivateAnyEnterWorldSuccess","reco_id":400000006},"reco_id":400000006,"task_id":200000001}]`,

  nextListStarting: `[2026-02-25 09:16:31.780][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.NextList.Starting] [details={"focus":null,"list":[{"anchor":false,"jump_back":false,"name":"ScenePrivateAnyEnterWorldSuccess"},{"anchor":false,"jump_back":true,"name":"ScenePrivateLogin"},{"anchor":false,"jump_back":true,"name":"SceneDialogConfirm"}],"name":"SceneAnyEnterWorld","task_id":200000001}]`,

  pipelineNodeSucceeded: `[2026-02-25 09:16:31.761][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.PipelineNode.Succeeded] [details={"focus":null,"name":"SceneEnterMenuValuables","node_details":{"action_id":500000003,"completed":true,"name":"SceneAnyEnterWorld","node_id":300000003,"reco_id":400000005},"node_id":300000003,"reco_details":{"algorithm":"DirectHit","box":[0,0,0,0],"detail":null,"name":"SceneAnyEnterWorld","reco_id":400000005},"task_id":200000001}]`,

  actionStarting: `[2026-02-25 09:16:31.341][INF][Px349896][Tx60974][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Action.Starting] [details={"action_id":500000003,"focus":null,"name":"SceneAnyEnterWorld","task_id":200000001}]`,

  actionSucceeded: `[2026-02-25 09:16:31.761][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Action.Succeeded] [details={"action_details":{"action":"DoNothing","action_id":500000003,"box":[0,0,0,0],"detail":{},"name":"SceneAnyEnterWorld","success":true},"action_id":500000003,"focus":null,"name":"SceneAnyEnterWorld","task_id":200000001}]`,

  taskStarting: `[2026-02-25 09:16:31.337][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Task.Starting] [details={"focus":null,"name":"SceneEnterMenuValuables","task_id":200000001}]`,

  taskCompleted: `[2026-02-25 09:16:31.761][INF][Px334800][Tx7539][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Task.Completed] [details={"focus":null,"name":"SceneEnterMenuValuables","task_id":200000001}]`,
};

export const MAAEND_EXPECTED_RESULTS = {
  recognitionStarting: {
    msg: "Node.Recognition.Starting",
    name: "ScenePrivateAnyEnterWorldSuccess",
    recoId: 400000006,
    taskId: 200000001,
  },

  recognitionSucceeded: {
    msg: "Node.Recognition.Succeeded",
    name: "SceneAnyEnterWorld",
    algorithm: "DirectHit",
  },

  recognitionFailed: {
    msg: "Node.Recognition.Failed",
    name: "ScenePrivateAnyEnterWorldSuccess",
  },

  nextList: {
    msg: "Node.NextList.Starting",
    name: "SceneAnyEnterWorld",
    listCount: 3,
    firstItem: "ScenePrivateAnyEnterWorldSuccess",
  },

  pipelineNodeSucceeded: {
    msg: "Node.PipelineNode.Succeeded",
    name: "SceneEnterMenuValuables",
    nodeName: "SceneAnyEnterWorld",
    nodeId: 300000003,
  },
};
