/* Formato de linha divisória compatível com Quill 2. */
export function registerDivider(Quill) {
  if (Quill.imports["formats/divider"]) return;
  const BlockEmbed = Quill.import("blots/block/embed");
  class Divider extends BlockEmbed {
    static blotName = "divider";
    static tagName = "HR";
  }
  Quill.register(Divider, true);
}
export function insertDivider(quill) {
  const range = quill.getSelection(true);
  if (!range) return;
  const index = range.index;
  quill.insertEmbed(index, "divider", true, "user");
  quill.setSelection(index + 1, 0, "silent");
}
