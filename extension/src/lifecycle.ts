// Ownership is recorded when DOM data arrives, even while export is disabled.
export class ScriptOwnership {
  private owners = new WeakMap<object, string>();
  constructor(private id: string) {}
  observe(nodes: object[]) {
    for (const node of nodes)
      if (!this.owners.has(node)) this.owners.set(node, this.id);
  }
  change(id: string, existing: object[]) {
    this.observe(existing);
    this.id = id;
  }
  belongs(node: object, id: string) {
    return this.owners.get(node) === id;
  }
}
