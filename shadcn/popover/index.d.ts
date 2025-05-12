import { Popover as PopoverPrimitive } from "bits-ui";
import Content from "./popover-content.svelte";
declare const Root: import("svelte").Component<import("bits-ui").PopoverRootPropsWithoutHTML, {}, "open">;
declare const Trigger: import("svelte").Component<PopoverPrimitive.TriggerProps, {}, "ref">;
declare const Close: import("svelte").Component<PopoverPrimitive.CloseProps, {}, "ref">;
export { Root, Content, Trigger, Close, Root as Popover, Content as PopoverContent, Trigger as PopoverTrigger, Close as PopoverClose, };
//# sourceMappingURL=index.d.ts.map