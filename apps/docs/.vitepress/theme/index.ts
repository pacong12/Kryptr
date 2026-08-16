import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import StatusBanner from './StatusBanner.vue';
import './style.css';

/**
 * Docs theme extension: registers the phase-status banner driven by each
 * page's front matter (`status: live | preview | planned`). No analytics,
 * no third-party components — only the default theme plus this banner.
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('StatusBanner', StatusBanner);
  },
} satisfies Theme;
