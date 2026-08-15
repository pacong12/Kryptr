import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import WalletDetailPage from '@/pages/WalletDetailPage.vue';

export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/wallets/:walletId',
    name: 'wallet-detail',
    component: WalletDetailPage,
    props: true,
  },
];

/**
 * Router factory so tests can inject memory history.
 * Defaults to HTML5 history for the app shell.
 */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    history: history ?? createWebHistory(),
    routes,
  });
}
