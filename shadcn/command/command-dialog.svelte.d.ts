import type { Command as CommandPrimitive, Dialog as DialogPrimitive, WithoutChildrenOrChild } from "bits-ui";
import type { Snippet } from "svelte";
type $$ComponentProps = WithoutChildrenOrChild<DialogPrimitive.RootProps> & WithoutChildrenOrChild<CommandPrimitive.RootProps> & {
    portalProps?: DialogPrimitive.PortalProps;
    children: Snippet;
};
declare const CommandDialog: import("svelte").Component<$$ComponentProps, {}, "open" | "value" | "ref">;
type CommandDialog = ReturnType<typeof CommandDialog>;
export default CommandDialog;
