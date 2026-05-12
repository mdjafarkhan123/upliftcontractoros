import { generateSecret, generateURI, generate } from 'otplib';

const email = process.argv[2] ?? 'admin@example.com';
const issuer = 'ContractorOs';

const secret = await generateSecret();
const otpauth = generateURI({ secret, issuer, label: email });
const code = await generate({ secret });

console.log('\nSUPER_ADMIN_TOTP_SECRET=' + secret);
console.log('\notpauth URL (paste into a QR generator, then scan with your authenticator app):');
console.log(otpauth);
console.log('\nCurrent code (sanity check):', code);
