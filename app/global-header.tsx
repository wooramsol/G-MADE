import Image from "next/image";
import Link from "next/link";
import { BrandSubtitle, BrandTitle, Caption, FormLabel } from "@/components/typography";
import { auth } from "@/auth";
import { getReleaseVersionLabel } from "@/lib/release-version";
import { getRoleLabel } from "@/lib/role-labels";
import TopNavigation from "./top-navigation";

export default async function GlobalHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="bg-white">
      <div className="bg-gradient-to-r from-[#0f4d87] via-[#176dab] to-[#15345b] px-6 py-3 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <Link className="flex items-center gap-4" href="/">
            <div className="my-2 flex h-14 w-56 items-center">
              <Image
                alt="G-MADE HIVE"
                className="h-auto w-full object-contain"
                height={180}
                priority
                src="/brand/banner-low.png"
                width={520}
              />
            </div>
            <div>
              <BrandSubtitle>경관·공공디자인 사전심의 지원</BrandSubtitle>
              <div className="flex flex-wrap items-center gap-2">
                <BrandTitle>AI-전문가 하이브리드 평가 시스템</BrandTitle>
                <span
                  className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-blue-50"
                  title="현재 배포 버전"
                >
                  {getReleaseVersionLabel()}
                </span>
              </div>
            </div>
          </Link>
          {user ? (
            <div className="hidden text-right sm:block">
              <FormLabel className="text-white">{user.name}</FormLabel>
              <Caption className="text-blue-100">
                {getRoleLabel(user.role)} · {user.email}
              </Caption>
            </div>
          ) : null}
        </div>
      </div>
      <TopNavigation isAuthenticated={Boolean(user)} />
    </header>
  );
}
