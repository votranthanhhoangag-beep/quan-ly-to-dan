export const getInternalEmail = (username: string) => {
  const localPart = username
    .trim()
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!localPart) throw new Error('Tên đăng nhập phải có ít nhất một ký tự chữ hoặc số.');
  if (localPart.length > 64) throw new Error('Tên đăng nhập quá dài.');
  return `${localPart}@erp.local`;
};
