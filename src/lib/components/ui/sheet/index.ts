import { Dialog as DialogPrimitive } from 'bits-ui';

import Root from './sheet.svelte';
import Content from './sheet-content.svelte';
import Header from './sheet-header.svelte';
import Title from './sheet-title.svelte';

const Trigger = DialogPrimitive.Trigger;
const Close = DialogPrimitive.Close;
const Portal = DialogPrimitive.Portal;

export {
	Root,
	Trigger,
	Close,
	Portal,
	Content,
	Header,
	Title,
	//
	Root as Sheet,
	Trigger as SheetTrigger,
	Close as SheetClose,
	Portal as SheetPortal,
	Content as SheetContent,
	Header as SheetHeader,
	Title as SheetTitle
};
