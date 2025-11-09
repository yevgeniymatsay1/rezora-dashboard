
// @ts-nocheck

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/form/PasswordInput";
import { LabelWithRequired, RequiredFieldsNote } from "@/components/form/RequiredFieldIndicator";
import { FloatingLabelInput } from "@/components/form/FloatingLabelInput";
import { FloatingLabelPasswordInput } from "@/components/form/FloatingLabelPasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAutoFocus, useFormFocus } from "@/lib/form-focus";
import { CircleNotch as Loader2, ArrowLeft } from "@phosphor-icons/react";
import { useInlineValidation } from "@/hooks/useInlineValidation";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authView, setAuthView] = useState<'signin' | 'signup' | 'forgot-password' | 'reset-password'>('signin');
  const [resetEmail, setResetEmail] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Inline validation for sign-in form
  const signInValidation = useInlineValidation({
    email: {
      rules: [
        {
          validate: (value) => !!value,
          message: 'Email is required'
        },
        {
          validate: (value) => {
            if (!value) return true;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(value);
          },
          message: 'Please enter a valid email address'
        }
      ],
      validateOnChange: true,
      validateOnBlur: true
    },
    password: {
      rules: [
        {
          validate: (value) => !!value,
          message: 'Password is required'
        }
      ],
      validateOnChange: true,
      validateOnBlur: true
    }
  });

  // Inline validation for sign-up form
  const signUpValidation = useInlineValidation({
    firstName: {
      rules: [
        {
          validate: (value) => !!value,
          message: 'First name is required'
        }
      ],
      validateOnChange: true,
      validateOnBlur: true
    },
    lastName: {
      rules: [
        {
          validate: (value) => !!value,
          message: 'Last name is required'
        }
      ],
      validateOnChange: true,
      validateOnBlur: true
    },
    signupEmail: {
      rules: [
        {
          validate: (value) => !!value,
          message: 'Email is required'
        },
        {
          validate: (value) => {
            if (!value) return true;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(value);
          },
          message: 'Please enter a valid email address'
        }
      ],
      validateOnChange: true,
      validateOnBlur: true
    },
    signupPassword: {
      rules: [
        {
          validate: (value) => !!value,
          message: 'Password is required'
        },
        {
          validate: (value) => !value || value.length >= 6,
          message: 'Password must be at least 6 characters long'
        }
      ],
      validateOnChange: true,
      validateOnBlur: true
    }
  });

  useEffect(() => {
    // Check for password reset token in URL FIRST
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const type = searchParams.get('type');
    
    if (type === 'recovery' && accessToken && refreshToken) {
      // Set the session tokens for password update
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      setAuthView('reset-password');
      setCheckingAuth(false);
      return;
    }
    
    // Only check if user is already authenticated if NOT in recovery mode
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/", { replace: true });
      }
      setCheckingAuth(false);
    };
    
    checkAuth();
  }, [navigate, searchParams]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign in error:', error);
        let errorMessage = "Failed to sign in. Please check your credentials.";
        
        if (error.message.includes("Invalid login credentials")) {
          errorMessage = "Invalid email or password. Please try again.";
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = "Please check your email and confirm your account.";
        }

        toast({
          title: "Sign In Failed",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have been signed in successfully.",
        });
        navigate("/", { replace: true });
      }
    } catch (error) {
      console.error('Unexpected sign in error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !firstName || !lastName) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) {
        console.error('Sign up error:', error);
        let errorMessage = "Failed to create account. Please try again.";
        
        if (error.message.includes("User already registered")) {
          errorMessage = "An account with this email already exists. Please sign in instead.";
        } else if (error.message.includes("Password")) {
          errorMessage = "Password must be at least 6 characters long.";
        }

        toast({
          title: "Sign Up Failed",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Account Created!",
          description: "Please check your email to confirm your account, then sign in.",
        });
        // Clear form and switch to sign in tab
        setEmail("");
        setPassword("");
        setFirstName("");
        setLastName("");
      }
    } catch (error) {
      console.error('Unexpected sign up error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast({
        title: "Error",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        console.error('Password reset error:', error);
        toast({
          title: "Reset Failed",
          description: "Failed to send reset email. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Reset Email Sent!",
          description: "Please check your email for password reset instructions.",
        });
        setAuthView('signin');
        setResetEmail("");
      }
    } catch (error) {
      console.error('Unexpected reset error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('Password update error:', error);
        toast({
          title: "Update Failed",
          description: "Failed to update password. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password Updated!",
          description: "Your password has been successfully updated.",
        });
        navigate("/", { replace: true });
      }
    } catch (error) {
      console.error('Unexpected update error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Authentication Form (40%) */}
      <div className="w-full lg:w-2/5 flex items-center justify-center p-8">
        <Card className="w-full max-w-md border-0 shadow-none lg:shadow-lg lg:border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 gradient-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xl">R</span>
          </div>
          <CardTitle className="text-2xl">Welcome to Rezora</CardTitle>
          <CardDescription>
            AI-powered calling platform for real estate professionals
          </CardDescription>
        </CardHeader>
        <CardContent>
          {authView === 'forgot-password' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAuthView('signin')}
                  className="p-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h3 className="text-lg font-semibold">Reset Password</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">Email</Label>
                  <Input
                    id="resetEmail"
                    type="email"
                    placeholder="Enter your email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    disabled={loading}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending Reset Email...
                    </>
                  ) : (
                    "Send Reset Email"
                  )}
                </Button>
              </form>
            </div>
          )}

          {authView === 'reset-password' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Set New Password</h3>
                <p className="text-sm text-muted-foreground">
                  Please enter your new password below.
                </p>
              </div>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </form>
            </div>
          )}

          {(authView === 'signin' || authView === 'signup') && (
            <Tabs value={authView} onValueChange={(value) => setAuthView(value as 'signin' | 'signup')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div>
                    <FloatingLabelInput
                      id="email"
                      type="email"
                      label="Email *"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        signInValidation.handleFieldChange('email', e.target.value);
                      }}
                      onBlur={(e) => signInValidation.handleFieldBlur('email', e.target.value)}
                      disabled={loading}
                      required
                      autoFocus
                      error={!!signInValidation.getFieldError('email')}
                    />
                    {signInValidation.getFieldError('email') && (
                      <p className="text-sm text-destructive mt-1">{signInValidation.getFieldError('email')}</p>
                    )}
                  </div>
                  <div>
                    <FloatingLabelPasswordInput
                      id="password"
                      label="Password *"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        signInValidation.handleFieldChange('password', e.target.value);
                      }}
                      onBlur={(e) => signInValidation.handleFieldBlur('password', e.target.value)}
                      disabled={loading}
                      required
                      error={!!signInValidation.getFieldError('password')}
                    />
                    {signInValidation.getFieldError('password') && (
                      <p className="text-sm text-destructive mt-1">{signInValidation.getFieldError('password')}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-sm"
                      onClick={() => setAuthView('forgot-password')}
                      disabled={loading}
                    >
                      Forgot Password?
                    </Button>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                  
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-muted"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                    onClick={() => {
                      toast({
                        title: "Coming Soon",
                        description: "Google login will be available soon.",
                      });
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Continue with Google
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FloatingLabelInput
                        id="firstName"
                        label="First Name *"
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          signUpValidation.handleFieldChange('firstName', e.target.value);
                        }}
                        onBlur={(e) => signUpValidation.handleFieldBlur('firstName', e.target.value)}
                        disabled={loading}
                        required
                        autoFocus
                        error={!!signUpValidation.getFieldError('firstName')}
                      />
                      {signUpValidation.getFieldError('firstName') && (
                        <p className="text-sm text-destructive mt-1">{signUpValidation.getFieldError('firstName')}</p>
                      )}
                    </div>
                    <div>
                      <FloatingLabelInput
                        id="lastName"
                        label="Last Name *"
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          signUpValidation.handleFieldChange('lastName', e.target.value);
                        }}
                        onBlur={(e) => signUpValidation.handleFieldBlur('lastName', e.target.value)}
                        disabled={loading}
                        required
                        error={!!signUpValidation.getFieldError('lastName')}
                      />
                      {signUpValidation.getFieldError('lastName') && (
                        <p className="text-sm text-destructive mt-1">{signUpValidation.getFieldError('lastName')}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <FloatingLabelInput
                      id="signupEmail"
                      type="email"
                      label="Email *"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        signUpValidation.handleFieldChange('signupEmail', e.target.value);
                      }}
                      onBlur={(e) => signUpValidation.handleFieldBlur('signupEmail', e.target.value)}
                      disabled={loading}
                      required
                      error={!!signUpValidation.getFieldError('signupEmail')}
                    />
                    {signUpValidation.getFieldError('signupEmail') && (
                      <p className="text-sm text-destructive mt-1">{signUpValidation.getFieldError('signupEmail')}</p>
                    )}
                  </div>
                  <div>
                    <FloatingLabelPasswordInput
                      id="signupPassword"
                      label="Password (min 6 characters) *"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        signUpValidation.handleFieldChange('signupPassword', e.target.value);
                      }}
                      onBlur={(e) => signUpValidation.handleFieldBlur('signupPassword', e.target.value)}
                      disabled={loading}
                      required
                      minLength={6}
                      error={!!signUpValidation.getFieldError('signupPassword')}
                    />
                    {signUpValidation.getFieldError('signupPassword') && (
                        <p className="text-sm text-destructive mt-1">{signUpValidation.getFieldError('signupPassword')}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">* Required fields</p>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                  
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-muted"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                    onClick={() => {
                      toast({
                        title: "Coming Soon",
                        description: "Google login will be available soon.",
                      });
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Continue with Google
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>

      {/* Right side - Dashboard Preview (60%) */}
      <div className="hidden lg:flex lg:w-3/5 bg-gradient-to-br from-primary/10 via-secondary/20 to-accent/10 items-center justify-center p-12">
        <div className="max-w-2xl">
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 mb-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">R</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Welcome to Rezora</h2>
                <p className="text-muted-foreground">AI-powered calling for real estate success</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold">AI Voice Agents</h3>
                  <p className="text-sm text-muted-foreground">Natural conversations that convert leads</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold">Scale Your Outreach</h3>
                  <p className="text-sm text-muted-foreground">Make hundreds of calls simultaneously</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-secondary/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold">Real-Time Analytics</h3>
                  <p className="text-sm text-muted-foreground">Track performance and optimize campaigns</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Mini Dashboard Preview */}
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4">Your Dashboard Preview</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-primary/5 rounded-lg p-3">
                <p className="text-2xl font-bold text-primary">247</p>
                <p className="text-xs text-muted-foreground">Calls Made</p>
              </div>
              <div className="bg-accent/5 rounded-lg p-3">
                <p className="text-2xl font-bold text-accent">18</p>
                <p className="text-xs text-muted-foreground">Appointments</p>
              </div>
              <div className="bg-secondary/10 rounded-lg p-3">
                <p className="text-2xl font-bold text-primary">7.3%</p>
                <p className="text-xs text-muted-foreground">Conversion</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Active Campaign</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Running</span>
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg h-2 overflow-hidden">
                <div className="bg-primary h-full w-3/4 transition-all"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
