import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
	console.error('Usage: node gen-password.js "your-plaintext-password"');
	process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const escaped = hash.replace(/\$/g, '\\$');
console.log('\nSUPER_ADMIN_PASSWORD_HASH="' + escaped + '"');
console.log(
	'\n(Copy the line above into .env exactly as printed — the backslashes escape $ so dotenv-expand does not mangle the hash.)'
);
