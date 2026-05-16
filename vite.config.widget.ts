import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, 'src/widget/main.ts'),
			name: 'WebchatWidget',
			formats: ['iife'],
			fileName: () => 'webchat-widget.js'
		},
		outDir: 'static',
		emptyOutDir: false,
		minify: true,
		rollupOptions: {
			output: {
				inlineDynamicImports: true
			}
		}
	},
	resolve: {
		alias: {
			$lib: resolve(__dirname, 'src/lib')
		}
	}
});
