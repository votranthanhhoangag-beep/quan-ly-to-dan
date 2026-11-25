# React + TypeScript + Vite

## ERP Lục Bình: Trợ lý giọng nói

In the signed-in app, select **Trợ lý giọng nói · Tắt** and allow microphone access to enable hands-free use. The assistant enters **Chờ gọi “Trợ lý”** and begins listening for **“Trợ lý”** or **“Trợ lý ơi”**. It replies aloud, then enters command mode. Say **“Ngưng”**, **“Tạm dừng”**, **“Thôi không thao tác”**, or **“Ngủ đi”** to return to wake-name mode; select the Header button to turn it off completely.

Supported commands include opening a management/report screen (for example, **“Mở Dashboard”** or **“Mở Quản lý phiếu chi”**), switching a visible tab with **“Chọn tab [tên]”** or **“Xem [tên]”**, clicking visible actions such as **“Thêm mục mới”** and **“Lưu”**, filling a visible field by its label (for example, **“Điền số lượng 300”**), and selecting a matching native or custom dropdown value (for example, **“Chọn tổ đan [tên]”**). Vietnamese numbers such as **“500 ngàn”** and **“2 triệu rưỡi”** are supported. The assistant speaks a confirmation after each command and shows the heard command and result in the form voice status. Microphone and speech features require a browser that supports the Web Speech APIs; microphone access generally requires HTTPS or localhost.

## Mobile layout

On screens narrower than 761 px, use the menu button to open the navigation drawer. Account actions are grouped under **Tài khoản**, while wide data tables scroll horizontally within their panels.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
