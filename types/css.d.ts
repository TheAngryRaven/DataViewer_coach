// Allow side-effect CSS imports (e.g. uPlot's stylesheet) in the lazy panel
// module. The host bundler handles the actual stylesheet at build time.
declare module "*.css";
