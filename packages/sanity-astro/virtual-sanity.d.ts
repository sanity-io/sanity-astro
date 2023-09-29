declare module "sanity:client" {
  const sanityClient: import("./types").SanityClient;
  export default sanityClient;
}

declare module "sanity:studio" {
  const studioConfig: import("./types").Config;
  export default studioConfig;
}
