import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#e05947",
    colorForeground: "#f5f0e8",
    colorMutedForeground: "#a2afb0",
    colorDanger: "#f06d63",
    colorBackground: "#10252c",
    colorInput: "#0d1d22",
    colorInputForeground: "#f5f0e8",
    colorNeutral: "#2a4249",
    fontFamily: "Manrope, sans-serif",
    borderRadius: "0.85rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#10252c] rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#f5f0e8]",
    headerSubtitle: "text-[#a2afb0]",
    socialButtonsBlockButtonText: "text-[#f5f0e8]",
    formFieldLabel: "text-[#f5f0e8]",
    footerActionLink: "text-[#e05947]",
    footerActionText: "text-[#a2afb0]",
    dividerText: "text-[#a2afb0]",
    identityPreviewEditButton: "text-[#e05947]",
    formFieldSuccessText: "text-[#e6b85c]",
    alertText: "text-[#f5f0e8]",
    logoBox: "mb-4",
    logoImage: "rounded-md",
    socialButtonsBlockButton: "border-[#2a4249] bg-[#0d1d22] hover:bg-[#18333b]",
    formButtonPrimary: "bg-[#e05947] text-[#10252c] hover:bg-[#f06d63]",
    formFieldInput: "border-[#2a4249] bg-[#0d1d22] text-[#f5f0e8]",
    footerAction: "text-[#a2afb0]",
    dividerLine: "bg-[#2a4249]",
    alert: "border-[#f06d63]/40 bg-[#f06d63]/10",
    otpCodeFieldInput: "border-[#2a4249] bg-[#0d1d22] text-[#f5f0e8]",
    formFieldRow: "text-[#f5f0e8]",
    main: "bg-transparent",
  },
};

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={Admin} />
      <Route path="/sign-in/*?" component={() => <Auth mode="sign-in" />} />
      <Route path="/sign-up/*?" component={() => <Auth mode="sign-up" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Auth({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      {mode === "sign-in" ? (
        <SignInPage />
      ) : (
        <SignUpPage />
      )}
    </div>
  );
}

function SignInPage() {
  return (
    <SignIn
      routing="path"
      path={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
    />
  );
}

function SignUpPage() {
  return (
    <SignUp
      routing="path"
      path={`${basePath}/sign-up`}
      signInUrl={`${basePath}/sign-in`}
    />
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function ClerkApp() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access the control room",
          },
        },
        signUp: {
          start: {
            title: "Create station access",
            subtitle: "Set up your secure control room account",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkApp />
    </WouterRouter>
  );
}

export default App;
