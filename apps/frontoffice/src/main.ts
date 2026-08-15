import './styles.css';
import { createApp } from 'vue';
import App from './app/App.vue';
import { createAppRouter } from './router';

const app = createApp(App);
app.use(createAppRouter());
app.mount('#root');
