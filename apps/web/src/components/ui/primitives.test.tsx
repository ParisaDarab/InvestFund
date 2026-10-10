import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge, StatusPill } from './badge';
import { Button } from './button';
import { buttonVariantClasses, buttonVariants } from './button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Checkbox } from './checkbox';
import { Dialog, DialogTrigger } from './dialog';
import { focusRing } from './focus-ring';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectTrigger, SelectValue } from './select';
import { Skeleton } from './skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Textarea } from './textarea';

import type { ReactNode } from 'react';

import messages from '@/messages/en-GB.json';

// Server rendering until P0-TEST-01 adds jsdom + Testing Library (see vitest.config.ts).
function render(node: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en-GB" timeZone="Europe/London" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

/** Parses the first element's class list out of the rendered markup. */
function classesOf(html: string): string[] {
  return /class="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
}

const ringClasses = focusRing.split(' ');

describe('Button', () => {
  it.each(Object.entries(buttonVariantClasses))(
    'renders the %s variant with its token classes and the focus ring',
    (variant, classes) => {
      const html = render(
        <Button variant={variant as keyof typeof buttonVariantClasses}>{variant}</Button>,
      );
      const rendered = classesOf(html);
      expect(html).toMatch(/^<button type="button"/);
      expect(html).toContain(`data-variant="${variant}"`);
      expect(rendered).toEqual(expect.arrayContaining(classes.split(' ')));
      expect(rendered).toEqual(expect.arrayContaining(ringClasses));
    },
  );

  it('defaults to the primary variant and medium size', () => {
    const rendered = classesOf(render(<Button>Go</Button>));
    expect(rendered).toEqual(expect.arrayContaining(['bg-primary', 'text-primary-foreground']));
    expect(rendered).toContain('h-10');
  });

  it('keeps an explicit type and appends caller classes', () => {
    const html = render(
      <Button type="submit" size="sm" className="w-full">
        Save
      </Button>,
    );
    expect(html).toContain('type="submit"');
    expect(classesOf(html)).toEqual(expect.arrayContaining(['h-8', 'w-full']));
  });

  it('renders its child with the button styles when asChild is set', () => {
    const html = render(
      <Button asChild variant="outline">
        <a href="/en-GB/login">Sign in</a>
      </Button>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/en-GB/login"');
    expect(classesOf(html)).toEqual(expect.arrayContaining(['border-border', ...ringClasses]));
  });

  it('exposes the same classes to Server Components through buttonVariants()', () => {
    expect(buttonVariants({ variant: 'ghost', size: 'lg' })).toContain('hover:bg-muted');
    expect(buttonVariants()).toContain('bg-primary');
  });
});

describe('Badge and StatusPill', () => {
  it('renders badge variants', () => {
    expect(render(<Badge>New</Badge>)).toContain('bg-muted');
    expect(render(<Badge variant="primary">New</Badge>)).toContain('text-primary');
  });

  it.each([
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['danger', 'text-destructive'],
    ['info', 'text-primary'],
    ['neutral', 'text-muted-foreground'],
  ] as const)('renders the %s tone with %s and a decorative dot', (tone, cls) => {
    const html = render(<StatusPill tone={tone}>Status</StatusPill>);
    expect(html).toContain(`data-tone="${tone}"`);
    expect(classesOf(html)).toContain(cls);
    expect(html).toContain('<span aria-hidden="true" class="size-1.5 rounded-full bg-current">');
  });
});

describe('Card', () => {
  it('renders a bordered card surface with heading and description', () => {
    const html = render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Meta</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(classesOf(html)).toEqual(expect.arrayContaining(['bg-card', 'rounded-lg', 'border']));
    expect(html).toContain('<h3 class="type-h3 leading-tight">Title</h3>');
    expect(html).toContain('class="type-meta"');
  });
});

describe('form fields', () => {
  it('links Label to Input and shows the focus ring and invalid state', () => {
    const html = render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" aria-invalid="true" aria-describedby="name-error" />
      </>,
    );
    expect(html).toMatch(/<label [^>]*for="name"/);
    expect(html).toContain('type="text"');
    expect(html).toContain('aria-describedby="name-error"');
    expect(html).toContain('aria-invalid:border-destructive');
    expect(html).toContain(focusRing);
  });

  it('renders Textarea with field tokens', () => {
    const html = render(<Textarea id="summary" />);
    expect(classesOf(html)).toEqual(
      expect.arrayContaining(['bg-background', 'border-border', ...ringClasses]),
    );
  });

  it('renders Checkbox as an accessible checkbox button', () => {
    const html = render(<Checkbox id="terms" defaultChecked />);
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-[state=checked]:bg-primary');
    expect(html).toContain(focusRing);
  });

  it('renders the Select trigger as a combobox with a placeholder', () => {
    const html = render(
      <Select>
        <SelectTrigger id="stage">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
      </Select>,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('Choose');
    expect(html).toContain(focusRing);
  });
});

describe('Tabs', () => {
  it('renders the active tab and its panel', () => {
    const html = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*data-state="active"/);
    expect(html).toContain('Panel A');
    expect(html).not.toContain('Panel B');
    expect(html).toContain('data-[state=active]:bg-background');
  });
});

describe('Dialog', () => {
  it('renders a trigger that announces the dialog popup', () => {
    const html = render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
      </Dialog>,
    );
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('Skeleton', () => {
  it('is decorative and uses the muted token', () => {
    const html = render(<Skeleton className="h-4" />);
    expect(html).toContain('aria-hidden="true"');
    expect(classesOf(html)).toEqual(expect.arrayContaining(['bg-muted', 'animate-pulse', 'h-4']));
  });
});
