export default () => ({
  tingwu: {
    region: process.env.TINGWU_REGION ?? "cn-beijing",
    accessKeyId: process.env.TINGWU_ACCESS_KEY_ID ?? "",
    accessKeySecret: process.env.TINGWU_ACCESS_KEY_SECRET ?? "",
    appKey: process.env.TINGWU_APP_KEY ?? "",
    baseUrl: "https://tingwu.cn-beijing.aliyuncs.com",
  },
  pollingIntervalMs: Number(process.env.POLLING_INTERVAL_MS ?? 5000),
});
