import { useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExpandableDropdownProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function ExpandableDropdown({ title, children, defaultExpanded = false }: ExpandableDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card className="w-full">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between p-4 h-auto font-medium text-left"
      >
        <span>{title}</span>
        {isExpanded ? (
          <CaretDown className="h-4 w-4" />
        ) : (
          <CaretRight className="h-4 w-4" />
        )}
      </Button>
      
      <div className={cn(
        "overflow-hidden transition-all duration-200 ease-in-out",
        isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <CardContent className="pt-0 pb-4">
          {children}
        </CardContent>
      </div>
    </Card>
  );
}