"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useAuthStore from "@lib/stores/auth";
import { loginApi } from "@/lib/common/auth";
import { AuthResponse } from "@typings/auth";
import { toast } from "sonner";
import { ToastUI } from "@/components/ui/ToastUI";
import { roleRouter } from "@lib/roleRouter";
import { useRouter } from "next/navigation";

// 배경 곡선 애니메이션 설정
const bgVariants = {
  signIn: {
    x: "0%",
    right: "50%",
    borderBottomRightRadius: "50vw",
    borderTopLeftRadius: "50vw",
  },
  signUp: {
    x: "100%",
    right: "50%",
    borderBottomRightRadius: "0vw",
    borderTopLeftRadius: "100vw", // 반대 방향 곡선 효과
  },
};

const LoginForm = () => {
  const [isSignIn, setIsSignIn] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [name, setName] = useState<string>(""); // 회원가입 시 이름 입력 받는 필드 추가
  const [email, setEmail] = useState<string>(""); // 로그인과 회원가입 모두에서 이메일 입력 받는 필드
  const [password, setPassword] = useState<string>(""); // 로그인과 회원가입 모두에서 비밀번호 입력 받는 필드
  const [confirmPw, setConfirmPw] = useState<string>(""); // 회원가입 시 비밀번호 확인 입력 받는 필드 추가
  const [loading, setLoading] = useState<boolean>(false); // 로그인/회원가입 요청이 진행 중인지 여부를 나타내는 상태
  const [disabled, setDisabled] = useState<boolean>(false); // 입력 필드와 버튼을 비활성화할지 여부를 나타내는 상태 (예: 요청이 진행 중일 때)
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const router = useRouter();
  useEffect(() => {
    setIsLoaded(true);
    clearAuth();
  }, []);

  const toggle = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPw("");
    setIsSignIn(!isSignIn);
  };

  // const handleLogin = async (e: React.FormEvent): Promise<LoginResponse | undefined> => {
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data: AuthResponse = await loginApi({
        user_email: email,
        password: password,
      });
      // Zustand 스토어 업데이트
      const { user, accessToken } = data;
      const { userName, role } = user;
      setAuth(userName, accessToken);
      router.push(roleRouter(role));
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ??
        "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
      toast.custom((t) => <ToastUI t={t} message={message} duration={2000} />, {
        duration: 2000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const DURATION = 2000; // 4초

    try {
      // 의도적 에러 발생
      throw new Error("회원가입 기능은 현재 준비 중입니다.");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.";

      // 커스텀 토스트 호출
      toast.custom(
        (t) => <ToastUI t={t} message={errorMessage} duration={DURATION} />,
        {
          duration: DURATION, // Sonner가 실제로 토스트를 제거하는 시간
          onAutoClose: () => {
            setLoading(false);

            toggle();
          },
        },
      );
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="relative min-h-screen w-full bg-white overflow-hidden font-['Pretendard']">
      {/* --- BACKGROUND LAYER --- */}
      <motion.div
        className="absolute top-0 h-screen w-[300vw] z-6 shadow-2xl bg-linear-to-br from-sky-200 to-sky-700 hidden md:block"
        initial={false}
        animate={isSignIn ? "signIn" : "signUp"}
        variants={bgVariants}
        transition={{ duration: 1, ease: [0.645, 0.045, 0.355, 1.0] }}
        style={{ opacity: 0.7 }}
      />
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover"
      >
        <source src={`./iljin_main_02.mp4`} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      {/* --- CONTENT SECTION (TEXT & IMG) --- */}
      <div className="absolute inset-0 z-10 pointer-events-none flex w-full h-full">
        {/* Sign In Content */}
        <motion.div
          className="flex-1 flex flex-col items-center justify-center text-white"
          animate={{ x: isSignIn ? 0 : "-150%", opacity: isSignIn ? 1 : 0 }}
          transition={{ duration: 1 }}
        >
          <div className="p-16 text-center">
            <h2 className="text-6xl font-extrabold mb-4">Welcome</h2>
            <div className="w-64 h-64 bg-sky-700/20 rounded-full blur-2xl absolute -z-10" />
          </div>
        </motion.div>

        {/* Sign Up Content */}
        <motion.div
          className="flex-1 flex flex-col items-center justify-center text-white"
          animate={{ x: isSignIn ? "150%" : 0, opacity: isSignIn ? 0 : 1 }}
          transition={{ duration: 1 }}
        >
          <div className="p-16 text-center">
            <h2 className="text-6xl font-extrabold mb-4">Join with us</h2>
            <div className="w-64 h-64 bg-sky-700/20 rounded-full blur-2xl absolute -z-10" />
          </div>
        </motion.div>
      </div>

      {/* --- FORM SECTION --- */}
      <div className="flex h-screen w-full relative z-5">
        {/* SIGN UP FORM (Left Side) */}
        <div className="flex-1 flex items-center justify-center p-4">
          <AnimatePresence>
            {!isSignIn && (
              <motion.form
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl space-y-4"
                onSubmit={handleSignUp}
              >
                <h3 className="text-2xl font-bold text-slate-900 mb-6">
                  Sign Up
                </h3>
                <InputGroup
                  icon="👤"
                  placeholder="Username"
                  type="text"
                  value={name}
                  onChange={setName}
                  disabled={disabled}
                />
                <InputGroup
                  icon="✉️"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  disabled={disabled}
                />
                <InputGroup
                  icon="🔒"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  disabled={disabled}
                />
                <InputGroup
                  icon="🔒"
                  placeholder="Confirm password"
                  type="password"
                  value={confirmPw}
                  onChange={setConfirmPw}
                  disabled={disabled}
                />
                <button
                  className="w-full py-3 bg-sky-400 text-white 
                                    rounded-lg font-semibold text-lg hover:bg-sky-500 transition-colors"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "등록 중..." : "회원가입"}
                </button>
                <p className="text-xs text-center">
                  Already have an account?{" "}
                  <span
                    onClick={toggle}
                    className="font-bold cursor-pointer hover:underline text-slate-900"
                  >
                    Sign in here
                  </span>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* SIGN IN FORM (Right Side) */}
        <div className="flex-1 flex items-center justify-center p-4">
          <AnimatePresence>
            {isSignIn && (
              <motion.form
                onSubmit={handleLogin}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl space-y-4"
              >
                <h3 className="text-2xl font-bold text-slate-900 mb-6">
                  로그인
                </h3>
                <InputGroup
                  icon="👤"
                  placeholder="E-mail"
                  type="text"
                  value={email}
                  onChange={setEmail}
                  disabled={disabled}
                />
                <InputGroup
                  icon="🔒"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  disabled={disabled}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 rounded-lg font-semibold text-lg transition-all flex items-center justify-center gap-2
    ${
      loading
        ? "bg-slate-400 text-white/80 cursor-not-allowed shadow-inner" // 로딩 중: 색상 톤다운 및 클릭 방지 느낌
        : "bg-sky-400 text-white hover:bg-sky-500 active:scale-[0.98]" // 평소: 원래 색상 및 클릭 액션
    }
  `}
                >
                  {loading ? (
                    <>
                      {/* 빙글빙글 도는 Boxicon 로더 */}
                      <i className="bx bx-loader-alt bx-spin text-[22px]"></i>
                      <span>로그인 중...</span>
                    </>
                  ) : (
                    <span>로그인</span>
                  )}
                </button>
                <p className="text-xs text-center font-bold cursor-pointer">
                  비밀번호 찾기
                </p>
                <p className="text-xs text-center">
                  아이디 생성{" "}
                  <span
                    onClick={toggle}
                    className="font-bold cursor-pointer hover:underline text-slate-900"
                  >
                    회원가입 하러가기
                  </span>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

interface InputGroupProps {
  icon: React.ReactNode;
  placeholder: string;
  type: string;
  value?: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

// 재사용 가능한 인풋 컴포넌트
const InputGroup = ({
  icon,
  placeholder,
  type,
  value,
  onChange,
  disabled,
}: InputGroupProps) => (
  <div className="relative group">
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-500">
      {icon}
    </span>
    <input
      type={type}
      placeholder={placeholder}
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full pl-12 pr-4 py-3 bg-gray-100 text-slate-900 rounded-lg outline-none border-2 border-transparent focus:border-sky-500 focus:bg-white transition-all text-sm"
    />
  </div>
);

export default LoginForm;