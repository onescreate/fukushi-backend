const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 各機能のファイルを読み込む
const setupRoutes = require('./routes/setup');
const authRoutes = require('./routes/auth');

// URLの割り当て（すべて /api から始まるように設定）
app.use('/api', setupRoutes);
app.use('/api', authRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});