import { hashPassword } from './auth';

const password = process.argv[2];

if (!password) {
    console.error('Uso: npm run admin:hash -- "sua-senha"');
    process.exit(1);
}

console.log(hashPassword(password));
