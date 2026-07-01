import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**/*']
  },
  ...firebaseRulesPlugin.configs['flat/recommended']
];
