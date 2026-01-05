'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, Settings, BarChart3, FileText, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/auth-context';
import { NAVIGATION_ITEMS } from '@/utils/constants';

type NavItem = (typeof NAVIGATION_ITEMS)[number];
type Permissions = ReturnType<typeof useAuth>['permissions'];

const NavLinks: React.FC<{
  items: NavItem[];
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}> = ({ items, pathname, mobile = false, onNavigate }) => (
  <>
    {items.map((item) => {
      const isActive = pathname === item.href;
      const className = mobile
        ? `block px-3 py-2 rounded-md text-base font-medium transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`
        : `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`;

      return (
        <Link
          key={item.href}
          href={item.href}
          className={className}
          onClick={() => (mobile ? onNavigate?.() : undefined)}
        >
          {item.title}
        </Link>
      );
    })}
  </>
);

const UserMenu: React.FC<{ user: NonNullable<ReturnType<typeof useAuth>['user']>; permissions: Permissions }> = ({
  user,
  permissions,
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" className="relative h-8 w-8 rounded-full">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatar || undefined} alt={user.name} />
          <AvatarFallback>{user.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
        </Avatar>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-56" align="end" forceMount>
      <DropdownMenuLabel className="font-normal">
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium leading-none">{user.name}</p>
          <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          <p className="text-xs leading-none text-muted-foreground capitalize">{user.role}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/profile">
          <User className="mr-2 h-4 w-4" />
          Profile
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/profile/settings">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Link>
      </DropdownMenuItem>
      {permissions.canViewAnalytics && (
        <DropdownMenuItem asChild>
          <Link href="/dashboard/analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </Link>
        </DropdownMenuItem>
      )}
      {permissions.canAccessAdmin && (
        <DropdownMenuItem asChild>
          <Link href="/admin">
            <Shield className="mr-2 h-4 w-4" />
            Admin Panel
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/auth/logout">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const AuthButtons: React.FC = () => (
  <div className="flex items-center space-x-2">
    <Button variant="ghost" asChild>
      <Link href="/auth/login">Sign In</Link>
    </Button>
    <Button asChild>
      <Link href="/auth/register">Sign Up</Link>
    </Button>
  </div>
);

export const Navigation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user, permissions } = useAuth();

  const filteredNavItems = NAVIGATION_ITEMS.filter(item => 
    item.roles.includes(user?.role || 'guest')
  );

  return (
    <nav className="bg-background border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <FileText className="h-8 w-8 text-primary" />
              <span className="ml-2 text-xl font-bold text-foreground">
                Pharma Content
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-baseline space-x-2">
              <NavLinks items={filteredNavItems} pathname={pathname} />
            </div>
            {user ? <UserMenu user={user} permissions={permissions} /> : <AuthButtons />}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <div className="flex flex-col space-y-4 mt-8">
                  <NavLinks items={filteredNavItems} pathname={pathname} mobile onNavigate={() => setIsOpen(false)} />
                  <div className="border-t pt-4">
                    {user ? (
                      <div className="flex flex-col space-y-2">
                        <Link
                          href="/profile"
                          className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent"
                          onClick={() => setIsOpen(false)}
                        >
                          <User className="h-4 w-4" />
                          <span>Profile</span>
                        </Link>
                        <Link
                          href="/auth/logout"
                          className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent text-left w-full"
                          onClick={() => setIsOpen(false)}
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Log out</span>
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-2">
                        <Button asChild variant="outline">
                          <Link href="/auth/login" onClick={() => setIsOpen(false)}>
                            Sign In
                          </Link>
                        </Button>
                        <Button asChild>
                          <Link href="/auth/register" onClick={() => setIsOpen(false)}>
                            Sign Up
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};
