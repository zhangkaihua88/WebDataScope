import { initCommunityPanel } from './modules/communityPanel.js';
import { initProdMemoPanel } from './modules/prodMemoPanel.js';
import { initSessionPanel } from './modules/sessionPanel.js';
import { initSettingsPanel } from './modules/settingsPanel.js';
import { bindTabs } from './modules/ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    bindTabs();
    initCommunityPanel();
    await initProdMemoPanel();
    await initSessionPanel();
    await initSettingsPanel();
});
