const VIETNAM_MOBILE_NUMBER = /^0(?:3[2-9]|5[25689]|7[0-9]|8[1-9]|9[0-9])\d{7}$/;

export const filterPhoneDigits = (value: string) => value.replace(/\D/g, '');

export const isValidVietnamMobileNumber = (value: string) =>
  VIETNAM_MOBILE_NUMBER.test(value);
