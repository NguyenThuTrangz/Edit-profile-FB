// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCaption, looksStandard, parseCustom } from '../rules.js';

test('đổi số WhatsApp và link wa.me của nick cũ (Cathie)', () => {
  const r = cleanCaption('WhatsApp / Phone: +84 855 555 229\n👉 https://wa.me/84855555229', { nickName: 'Ella' });
  assert.equal(r.text, 'WhatsApp / Phone: +84 855 555 490\n👉 https://wa.me/84855555490');
  assert.deepEqual(r.warnings, []);
});

test('Emily: đổi số, bỏ Instagram + Email cá nhân, giữ fanpage', () => {
  const src = ['📲 WhatsApp: +84 946 628 755', 'Facebook: https://www.facebook.com/KEmbroideryFactory',
    'Instagram: https://www.instagram.com/emily_smock_clothing/', 'Email: sales.kembroidery@gmail.com', 'Location: Hanoi'].join('\n');
  const r = cleanCaption(src, { nickName: 'Sarah' });
  assert.equal(r.text, '📲 WhatsApp: +84 855 555 490\nFacebook: https://www.facebook.com/KEmbroideryFactory\nLocation: Hanoi');
});

test('Gracie: Contact + Facebook cá nhân → tên nick mới + fanpage', () => {
  const r = cleanCaption('📲 Contact Gracie K-embroidery for wholesale\nFacebook: https://www.facebook.com/gracie.smock.2024', { nickName: 'Olivia' });
  assert.equal(r.text, '📲 Contact Olivia at K-Embroidery for wholesale\nFacebook: https://www.facebook.com/KEmbroideryFactory');
});

test('"Facebook: Cathie Smocks" → K-Embroidery Factory, giữ Instagram công ty', () => {
  const r = cleanCaption('💌 Instagram: k_embroidery_smockedclothing\n📍 Facebook: Cathie Smocks', { nickName: 'Ella' });
  assert.equal(r.text, '💌 Instagram: k_embroidery_smockedclothing\n📍 Facebook: K-Embroidery Factory');
});

test('cảnh báo tên cũ còn sót và số lạ', () => {
  const r = cleanCaption('Hi, I am Lily. Call 0946 628 755', { nickName: 'Maily' });
  assert.ok(r.warnings.some(w => w.includes('Lily')));
  assert.ok(r.warnings.some(w => w.includes('Còn số lạ')));
});

test('quy tắc riêng + báo lỗi cú pháp', () => {
  const { rules, errors } = parseCustom('foo => bar\n# ghi chú\nsai dòng\n( => x');
  assert.equal(rules.length, 1); assert.equal(errors.length, 2);
  assert.equal(cleanCaption('foo FOO', { custom: 'foo => bar' }).text, 'bar bar');
});

test('nhận bài tuyển dụng là cần thay, bài smock là chuẩn', () => {
  assert.equal(looksStandard('🔥 Bạn giỏi tiếng Anh? Thích sale? Muốn kiếm 12-20 triệu'), false);
  assert.equal(looksStandard('Mình đang tuyển team Marketing về “chung nhà”'), false);
  assert.equal(looksStandard('Blue Blooms & Timeless Smocking – A Boutique Must-Have!'), true);
});

test('cảnh báo mã bài Kxxx còn sót', () => {
  const r = cleanCaption('DM or WhatsApp us code K151 for the catalog', { nickName: 'Olivia' });
  assert.ok(r.warnings.some(w => w.includes('K151')));
});
