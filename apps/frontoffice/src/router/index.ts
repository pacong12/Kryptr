import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import SwapPage from '@/pages/SwapPage.vue';
import WalletDetailPage from '@/pages/WalletDetailPage.vue';
import WalletLaunchPage from '@/pages/WalletLaunchPage.vue';
import WalletOrdersPage from '@/pages/WalletOrdersPage.vue';
import WalletOverviewPage from '@/pages/WalletOverviewPage.vue';

export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/wallets/:walletId',
    component: WalletDetailPage,
    props: true,
    children: [
      {
        path: '',
        name: 'wallet-detail',
        component: WalletOverviewPage,
        props: true,
      },
      {
        path: 'swap',
        name: 'wallet-swap',
        component: SwapPage,
        props: true,
      },
      {
        path: 'orders',
        name: 'wallet-orders',
        component: WalletOrdersPage,
        props: true,
      },
      {
        path: 'launch',
        name: 'wallet-launch',
        component: WalletLaunchPage,
        props: true,
      },
    ],
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
