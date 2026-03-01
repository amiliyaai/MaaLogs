export const M9A_LOG_SAMPLES = {
  nodeHit: `[2025-06-14 11:37:29.601][INF][Px4224][Tx33237][TaskBase.cpp][L131] node hit [result.name=TheAlarm] [result.box=[0 x 0 from (0, 0)]]`,

  nodeHitWithBox: `[2025-06-14 11:37:30.999][INF][Px4224][Tx33237][TaskBase.cpp][L131] node hit [result.name=Alarm_Find0/3] [result.box=[50 x 22 from (1182, 548)]]`,

  nodeDisabled: `[2025-06-14 11:37:31.710][DBG][Px4224][Tx33237][TaskBase.cpp][L101] node disabled Alarm_Select [pipeline_data.enable=false]`,

  runRecognitionEnter: `[2025-06-14 11:37:30.313][DBG][Px4224][Tx33237][TaskBase.cpp][L62] [cur_node_=TheAlarm] [list=["Alarm_End","Alarm_Find0/3"]] | enter`,

  runRecognitionLeave: `[2025-06-14 11:37:30.999][TRC][Px4224][Tx33237][TaskBase.cpp][L62] | leave, 686ms`,

  nestedRecognitionEnter: `[2025-06-14 11:37:37.755][DBG][Px18964][Tx19385][MaaContext.cpp][L32] MaaContextRunRecognition [context=0000006120CEF340] [entry=Alarm_FindStageFlag] [pipeline_override={"Alarm_FindStageFlag": {"roi": [449, 139, 61, 57]}}] | enter`,

  nestedRecognitionLeave: `[2025-06-14 11:37:37.760][TRC][Px18964][Tx19385][MaaContext.cpp][L32] MaaContextRunRecognition | leave, 6ms`,

  adbControllerCreate: `[2025-06-14 11:37:25.619][DBG][Px4224][Tx30300][MaaFramework.cpp][L22] MaaAdbControllerCreate [adb_path=D:/MuMuPlayer-12.0/shell/adb.exe] [address=127.0.0.1:16384] [screencap_methods=18446744073709551559] [input_methods=2] [config={"extras":{"mumu":{"enable":true,"index":0,"path":"D:/MuMuPlayer-12.0"}}}] [agent_path=E:\\download\\M9A\\MaaAgentBinary] [notify=00007FFE96273264] [notify_trans_arg=0000000000000000] | enter`,

  recognitionFailed: `[2025-06-14 11:37:37.767][DBG][Px4224][Tx33237][TaskBase.cpp][L62] [cur_node_=Alarm_FindStageFlag] [list=["Alarm_FindStageFlag"]] | enter`,

  bestResultNullopt: `[2025-06-14 11:37:37.768][DBG][Px4224][Tx33237][TemplateMatcher.cpp][L45] Alarm_FindStageFlag [all_results_=[]] [filtered_results_=[]] [best_result_=nullopt]`,

  directHit: `[2025-06-14 11:56:44.217][DBG][Px21136][Tx55018][TaskBase.cpp][L62] [cur_node_=EatCandy] [list=["Screenshot"]] | enter`,
};

export const M9A_EXPECTED_SCREENCAP_METHODS = [
  "EncodeToFileAndPull",
  "Encode",
  "RawWithGzip",
  "RawByNetcat",
  "MinicapDirect",
  "MinicapStream",
  "EmulatorExtras",
];

export const M9A_EXPECTED_RESULTS = {
  nodeHit: {
    nodeName: "TheAlarm",
    status: "success",
    box: [0, 0, 0, 0],
  },

  nodeDisabled: {
    nodeName: "Alarm_Select",
    status: "disabled",
  },

  runRecognition: {
    curNode: "TheAlarm",
    nextList: ["Alarm_End", "Alarm_Find0/3"],
  },

  nestedRecognition: {
    entry: "Alarm_FindStageFlag",
  },

  adbController: {
    type: "adb",
    address: "127.0.0.1:16384",
    screencapMethods: M9A_EXPECTED_SCREENCAP_METHODS,
    inputMethods: ["MinitouchAndAdbKey"],
  },
};
