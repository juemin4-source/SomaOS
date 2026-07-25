// jsdom 不支持的 browser API 的 polyfill
import "@testing-library/jest-dom";

// scrollIntoView 在 jsdom 中不存在
Element.prototype.scrollIntoView = () => {};
