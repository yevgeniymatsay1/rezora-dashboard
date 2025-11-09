const rawDeveloperEmail = (import.meta.env.VITE_DEVELOPER_EMAIL ?? "yevgeniymatsay@kw.com").toLowerCase();

export const getDeveloperEmail = () => rawDeveloperEmail;

export const isDeveloperEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return email.toLowerCase() === rawDeveloperEmail;
};

