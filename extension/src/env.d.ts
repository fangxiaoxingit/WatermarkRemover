declare module "*.css?inline" {
  const content: string;
  export default content;
}
declare module "*.css";

declare module "*.svg?raw" {
  const text: string;
  export default text;
}
