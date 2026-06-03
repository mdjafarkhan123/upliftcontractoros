import { fontFamily } from 'tailwindcss/defaultTheme';
import type { Config } from 'tailwindcss';

const config: Config = {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		screens: {
			sm: '640px',
			md: '768px',
			lg: '1024px',
			xl: '1280px',
			'2xl': '1536px'
		},
		extend: {
			colors: {
				border: 'hsl(var(--border) / <alpha-value>)',
				input: 'hsl(var(--input) / <alpha-value>)',
				ring: 'hsl(var(--ring) / <alpha-value>)',
				background: 'hsl(var(--background) / <alpha-value>)',
				foreground: 'hsl(var(--foreground) / <alpha-value>)',
				sidebar: 'hsl(var(--sidebar) / <alpha-value>)',
				'card-raised': 'hsl(var(--card-raised) / <alpha-value>)',
				primary: {
					DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
					foreground: 'hsl(var(--primary-foreground) / <alpha-value>)'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
					foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
					foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
					foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
					foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
					foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
				},
				card: {
					DEFAULT: 'hsl(var(--card) / <alpha-value>)',
					foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			fontFamily: {
				sans: [...fontFamily.sans]
			},
			boxShadow: {
				card: 'var(--shadow-card)',
				dropdown: 'var(--shadow-dropdown)',
				modal: 'var(--shadow-modal)'
			},
			spacing: {
				'bottom-nav': 'var(--bottom-nav-height)'
			},
			minHeight: {
				touch: '44px'
			},
			minWidth: {
				touch: '44px'
			},
			keyframes: {
				'spark-flash': {
					'0%, 88%, 100%': {
						transform: 'scale(1) rotate(0deg)',
						filter: 'drop-shadow(0 0 0 hsl(var(--primary) / 0))',
						color: 'hsl(var(--muted-foreground))'
					},
					'92%': {
						transform: 'scale(1.25) rotate(-8deg)',
						filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.8))',
						color: 'hsl(var(--primary))'
					},
					'96%': {
						transform: 'scale(1.15) rotate(6deg)',
						filter: 'drop-shadow(0 0 3px hsl(var(--primary) / 0.5))',
						color: 'hsl(var(--primary))'
					}
				}
			},
			animation: {
				'spark-flash': 'spark-flash 3.5s ease-in-out infinite'
			}
		}
	},
	plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')]
};

export default config;
