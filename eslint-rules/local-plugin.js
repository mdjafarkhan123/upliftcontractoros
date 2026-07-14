/**
 * Local ESLint plugin — project-specific UI-consistency rules.
 *
 * Part of the "UI consistency enforcement" plan. See
 * .claude/skills/contractor-crm-design/references/ui-primitives.md for the
 * registry of built primitives these rules point people toward.
 */

const BANNED_INPUT_TYPES = {
	date: 'Calendar ($lib/components/ui/calendar)',
	'datetime-local': 'DateTimePicker ($lib/components/ui/date-time-picker)',
	// No time-only primitive exists yet, so this stays a soft nudge for now.
	time: 'DateTimePicker, or build a time-only picker under $lib/components/ui'
};

/**
 * Reads a fully-static attribute value (e.g. type="date"). Returns null for
 * dynamic values like type={someExpr}, which we can't statically judge.
 */
function getStaticAttributeValue(attr) {
	let str = '';
	for (const value of attr.value) {
		if (value.type === 'SvelteLiteral') str += value.value;
		else return null;
	}
	return str;
}

/** @type {import('eslint').Rule.RuleModule} */
const noNativeDatetimeInput = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow native <input type="date|time|datetime-local">. Use the built Calendar / DateTimePicker primitives (CLAUDE.md Rule 4).'
		},
		schema: [],
		messages: {
			native:
				'Native <input type="{{type}}"> is banned — use the built {{replacement}} instead. See .claude/skills/contractor-crm-design/references/ui-primitives.md.'
		}
	},
	create(context) {
		return {
			// Same AST shape eslint-plugin-svelte's own button-has-type rule uses.
			"SvelteElement[name.name='input'] > SvelteStartTag"(startTag) {
				for (const attr of startTag.attributes) {
					if (attr.type !== 'SvelteAttribute' || attr.key.name !== 'type') continue;
					const typeVal = getStaticAttributeValue(attr);
					if (typeVal && Object.prototype.hasOwnProperty.call(BANNED_INPUT_TYPES, typeVal)) {
						context.report({
							node: attr,
							messageId: 'native',
							data: { type: typeVal, replacement: BANNED_INPUT_TYPES[typeVal] }
						});
					}
				}
			}
		};
	}
};

export default {
	rules: {
		'no-native-datetime-input': noNativeDatetimeInput
	}
};
