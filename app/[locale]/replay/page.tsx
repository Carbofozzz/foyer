import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

export default async function ReplayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/cabinet/demo`);
}
