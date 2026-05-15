import { Popover as PopoverPrimitive } from 'bits-ui';

import Root from './popover.svelte';
import Content from './popover-content.svelte';

const Trigger = PopoverPrimitive.Trigger;
const Close = PopoverPrimitive.Close;

export {
	Root,
	Trigger,
	Content,
	Close,
	//
	Root as Popover,
	Trigger as PopoverTrigger,
	Content as PopoverContent,
	Close as PopoverClose
};
