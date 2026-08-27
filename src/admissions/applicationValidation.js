import {
  portalConfig,
  requiredApplicationBooleans,
  requiredApplicationFields,
} from './portalConfig';

const URL_FIELDS = [
  'github_url',
  'linkedin_url',
  'portfolio_url',
  'devpost_url',
];

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function isValidOptionalUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailList(value) {
  if (!value) {
    return true;
  }

  return String(value)
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .every((email) => EMAIL_RE.test(email));
}

export function validateApplication(formData) {
  const errors = {};

  requiredApplicationFields.forEach((field) => {
    if (!hasValue(formData[field])) {
      errors[field] = 'This field is required.';
    }
  });

  requiredApplicationBooleans.forEach((field) => {
    if (formData[field] !== true) {
      errors[field] = 'This confirmation is required.';
    }
  });

  // The applicant's own address. Required-ness is handled by the loop above;
  // this only runs once something has been typed, so an empty field shows
  // "required" rather than "invalid".
  if (formData.email && !EMAIL_RE.test(String(formData.email).trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!portalConfig.allowedSchools.includes(formData.school)) {
    errors.school = 'Applications are only open to selected schools for v1.';
  }

  if (!isValidEmailList(formData.teammate_emails)) {
    errors.teammate_emails = 'Enter teammate emails separated by commas.';
  }

  URL_FIELDS.forEach((field) => {
    if (!isValidOptionalUrl(formData[field])) {
      errors[field] = 'Enter a full URL starting with https://.';
    }
  });

  return errors;
}

export function getCompletionStats(formData) {
  const total =
    requiredApplicationFields.length + requiredApplicationBooleans.length;
  const complete =
    requiredApplicationFields.filter((field) => hasValue(formData[field]))
      .length +
    requiredApplicationBooleans.filter((field) => formData[field] === true)
      .length;

  return {
    complete,
    total,
    percent: Math.round((complete / total) * 100),
  };
}
