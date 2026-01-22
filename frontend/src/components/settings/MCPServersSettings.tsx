'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Server,
  Terminal,
  Globe,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
} from 'lucide-react';

// Real Brand Logos (official SVG paths with brand colors)
const GitHubLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 98 96" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
  </svg>
);

const SlackLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 128 128">
    <path fill="#E01E5A" d="M27 80c0 7.5-6.1 13.6-13.6 13.6S0 87.5 0 80s6.1-13.6 13.6-13.6H27V80zm6.8 0c0-7.5 6.1-13.6 13.6-13.6s13.6 6.1 13.6 13.6v34c0 7.5-6.1 13.6-13.6 13.6s-13.6-6.1-13.6-13.6V80z"/>
    <path fill="#36C5F0" d="M47.4 27c-7.5 0-13.6-6.1-13.6-13.6S39.9 0 47.4 0 61 6.1 61 13.6V27H47.4zm0 6.8c7.5 0 13.6 6.1 13.6 13.6s-6.1 13.6-13.6 13.6H13.6C6.1 61 0 54.9 0 47.4s6.1-13.6 13.6-13.6h33.8z"/>
    <path fill="#2EB67D" d="M101 47.4c0-7.5 6.1-13.6 13.6-13.6 7.5 0 13.6 6.1 13.6 13.6s-6.1 13.6-13.6 13.6H101V47.4zm-6.8 0c0 7.5-6.1 13.6-13.6 13.6-7.5 0-13.6-6.1-13.6-13.6V13.6C67 6.1 73.1 0 80.6 0s13.6 6.1 13.6 13.6v33.8z"/>
    <path fill="#ECB22E" d="M80.6 101c7.5 0 13.6 6.1 13.6 13.6 0 7.5-6.1 13.6-13.6 13.6-7.5 0-13.6-6.1-13.6-13.6V101h13.6zm0-6.8c-7.5 0-13.6-6.1-13.6-13.6 0-7.5 6.1-13.6 13.6-13.6h34c7.5 0 13.6 6.1 13.6 13.6 0 7.5-6.1 13.6-13.6 13.6H80.6z"/>
  </svg>
);

const NotionLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none">
    <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fill="#fff"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M61.35.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V20.64c0-2.21-.873-2.847-3.443-4.733L74.167 3.143C69.873.033 68.127-.36 61.35.227zM25.505 19.77c-5.38.317-6.6.387-9.667-1.943L7.44 11.123c-.97-.873-.583-1.943 1.553-2.14l53.193-3.887c4.47-.383 6.8 1.167 8.543 2.527l9.667 7c.39.193 1.36 1.357.193 1.357l-54.89 3.307-.193.483zM19.53 88.433V28.7c0-2.527.773-3.697 3.107-3.893l58.05-3.5c2.14-.193 3.107 1.167 3.107 3.693v59.537c0 2.527-.39 4.667-3.883 4.863l-55.537 3.307c-3.497.193-4.843-.967-4.843-4.277zm54.71-55.06c.39 1.75 0 3.5-1.75 3.7l-2.72.513v44.193c-2.333 1.167-4.47 1.75-6.22 1.75-2.913 0-3.69-.917-5.83-3.5L42.153 50.463v28.56l5.633 1.17s0 3.5-4.857 3.5l-13.397.777c-.39-.777 0-2.723 1.36-3.11l3.497-.917V40.503l-4.857-.39c-.39-1.75.583-4.277 3.3-4.47l14.367-.967 16.113 24.753V38.17l-4.667-.583c-.39-2.14 1.167-3.693 3.107-3.887l13.4-.777z" fill="#000"/>
  </svg>
);

const BraveLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 256 301">
    <path fill="#FB542B" d="M231.674 87.464l10.849-26.336-22.245-22.878L234.8 21.6l-13.874-9.184L210.08 0H155.52l-13.328 10.816L128 23.232l-14.192-12.416L100.48 0H45.92l-10.848 12.416L21.2 21.6l14.528 16.656L13.48 61.12l10.848 26.336-6.8 12.416s9.488 33.872 11.392 40.208c1.904 6.336 9.488 27.504 15.168 38.016 5.68 10.512 27.776 50.72 34.256 59.152 6.48 8.432 22.192 22.432 28.672 27.712 6.48 5.28 15.264 13.2 17.968 14.96l5.696 4.08h5.696l5.696-4.08c2.704-1.76 11.488-9.68 17.968-14.96 6.48-5.28 22.192-19.28 28.672-27.712 6.48-8.432 28.576-48.64 34.256-59.152 5.68-10.512 13.264-31.68 15.168-38.016 1.904-6.336 11.392-40.208 11.392-40.208l-6.856-12.416z"/>
    <path fill="#FFF" d="M190.592 123.392l5.056 14.944s-5.6 17.36-7.28 22.32c-1.68 4.96-10.08 25.76-13.776 32.48-3.696 6.72-17.472 31.92-21.392 37.52-3.92 5.6-14.56 17.36-19.04 21.28-4.48 3.92-12.32 9.52-13.44 10.64l-1.12 1.12h-4.48l-1.12-1.12c-1.12-1.12-8.96-6.72-13.44-10.64-4.48-3.92-15.12-15.68-19.04-21.28-3.92-5.6-17.696-30.8-21.392-37.52-3.696-6.72-12.096-27.52-13.776-32.48-1.68-4.96-7.28-22.32-7.28-22.32l5.056-14.944 31.024-11.2-8.96-28.56 27.664-12.32 13.664 9.52h28.896l13.664-9.52 27.664 12.32-8.96 28.56 31.024 11.2z"/>
  </svg>
);

const GoogleDriveLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 87.3 78">
    <path fill="#0066DA" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z"/>
    <path fill="#00AC47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z"/>
    <path fill="#EA4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z"/>
    <path fill="#00832D" d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z"/>
    <path fill="#2684FC" d="M59.85 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.85 53z"/>
    <path fill="#FFBA00" d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.5c0-1.55-.4-3.1-1.2-4.5l-12.75-22z"/>
  </svg>
);

const GmailLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 256 193">
    <path fill="#4285F4" d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727z"/>
    <path fill="#34A853" d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 18.907-27.026 24.727v98.911z"/>
    <path fill="#EA4335" d="M58.182 93.14l-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.67 34.992-4.67 40.644L128 145.504z"/>
    <path fill="#FBBC04" d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218z"/>
    <path fill="#C5221F" d="M0 49.504l26.759 20.07L58.182 93.14V17.504L41.891 5.286C24.61-7.66 0 4.646 0 26.23v23.273z"/>
  </svg>
);

const GoogleCalendarLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200">
    <path fill="#fff" d="M152.637 200H47.363C21.184 200 0 178.816 0 152.637V47.363C0 21.184 21.184 0 47.363 0h105.274C178.816 0 200 21.184 200 47.363v105.274C200 178.816 178.816 200 152.637 200z"/>
    <path fill="#1A73E8" d="M152.637 200H47.363C21.184 200 0 178.816 0 152.637V47.363C0 21.184 21.184 0 47.363 0h105.274C178.816 0 200 21.184 200 47.363v105.274C200 178.816 178.816 200 152.637 200z"/>
    <path fill="#fff" d="M152.637 23.684H47.363c-13.072 0-23.684 10.612-23.684 23.684v105.264c0 13.072 10.612 23.684 23.684 23.684h105.274c13.072 0 23.684-10.612 23.684-23.684V47.368c0-13.072-10.612-23.684-23.684-23.684z"/>
    <path fill="#1A73E8" d="M117.895 152.632H82.105c-3.26 0-5.921-2.66-5.921-5.921v-35.79c0-3.26 2.66-5.92 5.921-5.92h35.79c3.26 0 5.921 2.66 5.921 5.92v35.79c0 3.261-2.661 5.921-5.921 5.921z"/>
    <path fill="#EA4335" d="M160.526 47.368H39.474v-7.894c0-4.344 3.55-7.895 7.895-7.895h105.263c4.344 0 7.894 3.55 7.894 7.895v7.894z"/>
    <circle fill="#1A73E8" cx="65.789" cy="35.526" r="7.895"/>
    <circle fill="#1A73E8" cx="134.211" cy="35.526" r="7.895"/>
  </svg>
);

const GoogleMeetLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 87.5 72">
    <path fill="#00832d" d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z"/>
    <path fill="#0066da" d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z"/>
    <path fill="#e94235" d="M20.5 0L0 20.5l10.55 3 9.95-3 2.95-9.41z"/>
    <path fill="#2684fc" d="M20.5 20.5H0v31h20.5z"/>
    <path fill="#00ac47" d="M82.6 8.68L69.5 19.42v33.66l13.16 10.79c2.97 2.44 7.34.46 7.34-3.32V12.01c0-3.83-4.45-5.78-7.4-3.33z"/>
    <path fill="#00ac47" d="M49.5 36v15.5h-29V72h43c3.315 0 6-2.685 6-6V53.08z"/>
    <path fill="#ffba00" d="M63.5 0h-43v20.5h29V36l19.5-16.42V6c0-3.315-2.685-6-6-6z"/>
  </svg>
);

const PostgresLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 432.071 445.383">
    <g fill="#336791">
      <path d="M402.395 271.23c-6.86-12.735-18.587-20.112-33.103-20.82-4.234-.207-8.697.135-13.295.998-8.293 1.556-14.91 4.27-19.395 7.122 4.77-21.774 6.907-43.79 5.178-61.938-2.318-24.328-9.596-43.472-21.618-56.881-14.377-16.035-34.877-25.063-60.856-26.9-9.263-.655-19.843-.117-31.24 1.42-10.263-10.336-22.796-18.02-37.063-22.818-16.588-5.573-34.863-7.372-52.49-5.16-26.107 3.277-47.348 14.752-61.542 33.208-13.337 17.35-20.336 40.282-20.28 66.337.022 10.384 1.094 34.25 4.96 56.205 2.228 12.664 5.31 25.063 9.392 35.988 5.49 14.697 11.953 26.7 19.218 35.714 7.945 9.852 16.695 16.023 26.022 18.349 8.018 2 15.23 1.496 21.168-1.062 3.474 15.293 6.952 28.42 10.66 40.183 5.78 18.337 12.017 33.17 19.073 45.365 5.881 10.163 12.508 18.648 19.677 25.18 8.134 7.416 17.21 12.034 26.96 13.729 3.416.594 6.888.897 10.398.897 5.618 0 11.335-.685 17.082-2.062 17.835-4.27 33.756-14.81 47.28-31.303 7.74-9.437 14.626-20.827 21.033-34.787 2.133-4.647 4.092-9.463 5.91-14.41 9.82-.35 18.89-1.927 26.83-4.616 11.797-3.996 21.463-10.14 28.735-18.252 5.64-6.29 10.066-13.603 13.148-21.73 3.93-10.37 5.927-22.098 5.927-34.846 0-7.49-.587-15.247-1.744-23.069l-.008-.046c-.8-5.392-2.114-10.812-3.891-16.08-.098-.293-.2-.584-.3-.876z"/>
    </g>
    <path fill="#fff" d="M350.336 270.752c-.68-.183-1.37-.346-2.057-.508-5.643-1.324-11.152-2.064-16.434-2.267 8.74-35.72 8.08-70.18 1.912-92.16-5.99-21.34-19.78-37.28-39.85-46.07-8.33-3.65-17.27-5.92-26.6-6.73-1.22-.11-2.43-.19-3.64-.25 2.06-.93 4.05-1.98 5.96-3.17 11.56-7.18 20.08-18.26 24.68-32.05 2.68-8.04 4.03-16.85 4.03-26.17 0-3.17-.15-6.34-.44-9.49l-.04-.43c-.38-3.97-.98-7.93-1.78-11.85-.44-2.13-.93-4.25-1.49-6.34-2.9-10.84-7.51-20.65-13.67-29.14-11.23-15.47-27.12-26.13-47.22-31.68-7.34-2.03-15.22-3.25-23.44-3.62-3.8-.18-7.65-.17-11.51.01-.42.02-.84.04-1.26.07-.16.01-.32.02-.47.03-14.08.99-27.28 4.86-39.2 11.46-11.53 6.38-21.62 15.09-29.93 25.83-6.68 8.64-11.98 18.56-15.73 29.43-3.37 9.76-5.5 20.36-6.32 31.47-.23 3.13-.35 6.32-.35 9.55 0 12.43 1.56 25.42 4.77 38.58 5.18 21.23 14.02 42.37 26.25 62.8-1.58 2.88-2.89 5.93-3.91 9.14-1.42 4.47-2.35 9.14-2.81 13.88-.2 2.08-.31 4.19-.31 6.33 0 2.73.16 5.44.47 8.08.27 2.26.67 4.5 1.2 6.7.51 2.12 1.13 4.22 1.87 6.27l.24.67c.7 1.89 1.5 3.73 2.38 5.52 2.58 5.22 5.84 9.88 9.7 13.85 1.43 1.47 2.94 2.86 4.52 4.15-.5 1.66-.94 3.34-1.34 5.03-1.66 7.08-2.51 14.36-2.51 21.61 0 4.76.34 9.52 1.02 14.17.28 1.93.62 3.86 1.02 5.76l.15.73c.36 1.7.78 3.39 1.26 5.06.94 3.32 2.1 6.57 3.47 9.72 6.96 16 18.63 28.53 33.74 36.25 8.36 4.28 17.48 7.02 27.08 8.14 3.67.43 7.4.64 11.14.64 2.38 0 4.76-.1 7.12-.3 6.11-.5 12.18-1.57 17.97-3.2-.67 9.88-.8 18.5-.41 26.1.58 11.28 2.43 20.64 5.5 27.81 1.5 3.5 3.31 6.55 5.38 9.07 2.39 2.91 5.15 5.19 8.23 6.79.34.18.7.35 1.06.5 2.95 1.29 6.23 1.97 9.77 2.01.62.01 1.25 0 1.88-.03 3.57-.18 7.31-.94 11.12-2.27 3.77-1.32 7.61-3.17 11.43-5.53 11.51-7.1 22.22-18.5 31.84-33.89 5.74-9.18 10.87-19.52 15.27-30.78l.01-.02c1.63-4.18 3.11-8.52 4.41-12.97 3.96-.42 7.67-1.1 11.1-2.03l.78-.21c4.52-1.24 8.68-2.9 12.42-4.95 5.66-3.1 10.54-7.03 14.52-11.66 3.24-3.77 5.9-8.05 7.91-12.73 2.49-5.81 4.15-12.25 4.93-19.13.37-3.26.56-6.65.56-10.1 0-5.61-.44-11.43-1.32-17.3l-.05-.35c-.74-4.92-1.92-9.97-3.52-15.01-.54-1.7-1.15-3.39-1.79-5.06-.75-1.94-1.56-3.85-2.45-5.72-3.52-7.44-8.32-13.78-14.32-18.89-5.12-4.36-11.12-7.73-17.85-10.02l-.28-.09z"/>
  </svg>
);

const FilesystemLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
  </svg>
);

const MemoryLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z"/>
  </svg>
);

const PuppeteerLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 256 256">
    <path fill="#00D8A2" d="M128 0C57.308 0 0 57.308 0 128s57.308 128 128 128 128-57.308 128-128S198.692 0 128 0z"/>
    <path fill="#FFF" d="M96.5 80a16.5 16.5 0 100 33 16.5 16.5 0 000-33zm63 0a16.5 16.5 0 100 33 16.5 16.5 0 000-33zM128 160c-22.091 0-40 10.745-40 24h80c0-13.255-17.909-24-40-24z"/>
  </svg>
);

const PlaywrightLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 400 400">
    <path fill="#2EAD33" d="M200 0C89.543 0 0 89.543 0 200s89.543 200 200 200 200-89.543 200-200S310.457 0 200 0z"/>
    <path fill="#FFF" d="M145 120c-16.569 0-30 13.431-30 30v100c0 16.569 13.431 30 30 30h110c16.569 0 30-13.431 30-30V150c0-16.569-13.431-30-30-30H145zm25 50a15 15 0 110 30 15 15 0 010-30zm60 0a15 15 0 110 30 15 15 0 010-30zm-75 70h80s0 20-40 20-40-20-40-20z"/>
  </svg>
);

const SentryLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 72 66">
    <path fill="#362D59" d="M29 2.26a3.68 3.68 0 00-6.38 0L14.1 17.11a36.75 36.75 0 0119.28 31.39H25a28.44 28.44 0 00-14.94-24.32L6.56 30a3.68 3.68 0 00-6.38 0L.06 30.2a3.68 3.68 0 000 3.68l4.45 7.7a36.73 36.73 0 0114.94 24.32h8.38a44.84 44.84 0 00-19.38-35.92l3.54-6.13a3.68 3.68 0 016.38 0l.12.21a52.91 52.91 0 0123.89 42H50a60.9 60.9 0 00-28.94-50.27L29.12 2.47 29 2.26zm33.46 57.64a3.69 3.69 0 01-3.19 1.84 3.63 3.63 0 01-1.85-.5 3.68 3.68 0 01-1.34-5l8.54-14.79a3.68 3.68 0 016.38 0l.12.21a3.68 3.68 0 01-1.34 5l-7.32 13.24z"/>
  </svg>
);

const LinearLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100">
    <path fill="#5E6AD2" d="M1.22 61.5a48.94 48.94 0 0037.28 37.28L1.22 61.5zM0 50.03a50 50 0 0049.97 50L0 50.03zm50.03-50L100 49.97a50 50 0 00-49.97-50zM38.5 1.22A48.94 48.94 0 001.22 38.5L38.5 1.22zM100 50.03a50 50 0 01-50 49.97L100 50.03zM50 0a50 50 0 0150 50L50 0z"/>
  </svg>
);

const DiscordLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 127.14 96.36">
    <path fill="#5865F2" d="M107.7 8.07A105.15 105.15 0 0081.47 0a72.06 72.06 0 00-3.36 6.83 97.68 97.68 0 00-29.11 0A72.37 72.37 0 0045.64 0a105.89 105.89 0 00-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0032.17 16.15 77.7 77.7 0 006.89-11.11 68.42 68.42 0 01-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0064.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 01-10.87 5.19 77 77 0 006.89 11.1 105.25 105.25 0 0032.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z"/>
  </svg>
);

const TelegramLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 240 240">
    <path fill="#26A5E4" d="M120 0C53.73 0 0 53.73 0 120s53.73 120 120 120 120-53.73 120-120S186.27 0 120 0z"/>
    <path fill="#FFF" d="M177.93 71.75L156.3 175.68c-1.63 7.22-5.89 9-11.95 5.6l-33-24.32-15.91 15.32c-1.76 1.76-3.24 3.24-6.63 3.24l2.37-33.55 61.07-55.19c2.65-2.37-.58-3.68-4.12-1.31L75.87 131.2l-32.62-10.2c-7.09-2.22-7.23-7.09 1.48-10.5l127.52-49.14c5.9-2.15 11.07 1.43 9.13 10.39h-.45z"/>
  </svg>
);

const AirtableLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 170">
    <path fill="#FCB400" d="M90.04 12.72L10.18 44.79a7.12 7.12 0 000 13.28l79.86 32.07c6.46 2.59 13.68 2.59 20.14 0l79.86-32.07a7.12 7.12 0 000-13.28L110.18 12.72a21.3 21.3 0 00-20.14 0z"/>
    <path fill="#18BFFF" d="M105.73 100.32V165c0 4.65 4.87 7.77 9.16 5.87l78.76-32.65a7.12 7.12 0 004.35-6.56v-64.68c0-4.65-4.87-7.77-9.16-5.87l-78.76 32.65a7.12 7.12 0 00-4.35 6.56z"/>
    <path fill="#F82B60" d="M91.27 104.82L53.6 89.65l-41.32 17.11a7.12 7.12 0 00-4.35 6.56V165a7.12 7.12 0 009.94 6.54l68.46-30.88a7.12 7.12 0 004.35-6.56v-29.28h.59z"/>
    <path fill="#666" fillOpacity=".25" d="M91.27 104.82L53.6 89.65v37.42l37.67-15.69v-6.56z"/>
  </svg>
);

const SpotifyLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 168 168">
    <path fill="#1ED760" d="M84 0C37.65 0 0 37.65 0 84s37.65 84 84 84 84-37.65 84-84S130.35 0 84 0zm38.55 121.17c-1.5 2.46-4.72 3.24-7.18 1.73-19.67-12.02-44.43-14.73-73.59-8.07-2.81.64-5.61-1.12-6.25-3.93-.64-2.81 1.11-5.61 3.93-6.25 31.9-7.29 59.26-4.15 81.34 9.33 2.46 1.51 3.24 4.72 1.75 7.19zm10.29-22.88c-1.89 3.07-5.91 4.04-8.98 2.15-22.51-13.84-56.82-17.84-83.45-9.76-3.45 1.05-7.1-.9-8.15-4.35-1.04-3.45.91-7.09 4.35-8.14 30.42-9.23 68.22-4.76 94.07 11.13 3.07 1.89 4.04 5.9 2.16 8.97zm.88-23.75c-27-16.03-71.52-17.5-97.29-9.68-4.14 1.26-8.51-1.08-9.77-5.22-1.26-4.14 1.08-8.51 5.22-9.77 29.58-8.98 78.76-7.24 109.83 11.2 3.72 2.21 4.95 7.01 2.74 10.73-2.2 3.72-7.01 4.95-10.73 2.74z"/>
  </svg>
);

const EverArtLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="everart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF6B6B"/>
        <stop offset="50%" stopColor="#9B59B6"/>
        <stop offset="100%" stopColor="#3498DB"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="45" fill="url(#everart-grad)"/>
    <path fill="#FFF" d="M50 25c-13.807 0-25 11.193-25 25s11.193 25 25 25 25-11.193 25-25-11.193-25-25-25zm0 40c-8.284 0-15-6.716-15-15s6.716-15 15-15 15 6.716 15 15-6.716 15-15 15z"/>
  </svg>
);

const FetchLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
);

const SequentialThinkingLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z"/>
  </svg>
);

interface MCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  timeout?: number;
  toolPrefix?: string;
}

interface MCPServerStatus {
  id: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';
  toolCount: number;
  lastError?: string;
}

interface MCPTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  config: Omit<MCPServerConfig, 'id' | 'enabled'>;
  envVars?: { key: string; description: string; required: boolean }[];
}

const MCP_TEMPLATES: MCPTemplate[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Search repos, manage issues, PRs, and more',
    icon: <GitHubLogo className="h-8 w-8" />,
    config: {
      name: 'GitHub',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      toolPrefix: 'github',
      timeout: 30000,
    },
    envVars: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'GitHub personal access token', required: true },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send, search, and manage emails',
    icon: <GmailLogo className="h-8 w-8" />,
    config: {
      name: 'Gmail',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
      toolPrefix: 'gmail',
      timeout: 30000,
    },
    envVars: [
      { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth client ID', required: true },
      { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth client secret', required: true },
    ],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Create events, check availability, manage calendars',
    icon: <GoogleCalendarLogo className="h-8 w-8" />,
    config: {
      name: 'Google Calendar',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-calendar'],
      toolPrefix: 'gcal',
      timeout: 30000,
    },
    envVars: [
      { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth client ID', required: true },
      { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth client secret', required: true },
      { key: 'GOOGLE_REFRESH_TOKEN', description: 'Google OAuth refresh token', required: true },
    ],
  },
  {
    id: 'google-meet',
    name: 'Google Meet',
    description: 'Create and manage video meetings',
    icon: <GoogleMeetLogo className="h-8 w-8" />,
    config: {
      name: 'Google Meet',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-google-meet'],
      toolPrefix: 'meet',
      timeout: 30000,
    },
    envVars: [
      { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth client ID', required: true },
      { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth client secret', required: true },
      { key: 'GOOGLE_REFRESH_TOKEN', description: 'Google OAuth refresh token', required: true },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages and manage Slack channels',
    icon: <SlackLogo className="h-8 w-8" />,
    config: {
      name: 'Slack',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      toolPrefix: 'slack',
      timeout: 30000,
    },
    envVars: [
      { key: 'SLACK_BOT_TOKEN', description: 'Slack bot OAuth token (xoxb-...)', required: true },
      { key: 'SLACK_TEAM_ID', description: 'Slack workspace/team ID', required: true },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search and manage Notion pages',
    icon: <NotionLogo className="h-8 w-8" />,
    config: {
      name: 'Notion',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      toolPrefix: 'notion',
      timeout: 30000,
    },
    envVars: [
      { key: 'NOTION_API_KEY', description: 'Notion integration API key', required: true },
    ],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search via Brave',
    icon: <BraveLogo className="h-8 w-8" />,
    config: {
      name: 'Brave Search',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      toolPrefix: 'brave',
      timeout: 30000,
    },
    envVars: [
      { key: 'BRAVE_API_KEY', description: 'Brave Search API key', required: true },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search and read Google Drive files',
    icon: <GoogleDriveLogo className="h-8 w-8" />,
    config: {
      name: 'Google Drive',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gdrive'],
      toolPrefix: 'gdrive',
      timeout: 30000,
    },
    envVars: [
      { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth client ID', required: true },
      { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth client secret', required: true },
      { key: 'GOOGLE_REFRESH_TOKEN', description: 'Google OAuth refresh token', required: true },
    ],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    icon: <PostgresLogo className="h-8 w-8" />,
    config: {
      name: 'PostgreSQL',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:pass@localhost/db'],
      toolPrefix: 'pg',
      timeout: 30000,
    },
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage local files',
    icon: <FilesystemLogo className="h-8 w-8 text-amber-600" />,
    config: {
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
      toolPrefix: 'fs',
      timeout: 30000,
    },
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory and knowledge graph',
    icon: <MemoryLogo className="h-8 w-8 text-purple-600" />,
    config: {
      name: 'Memory',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      toolPrefix: 'memory',
      timeout: 30000,
    },
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation, screenshots, web scraping',
    icon: <PuppeteerLogo className="h-8 w-8" />,
    config: {
      name: 'Puppeteer',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      toolPrefix: 'puppeteer',
      timeout: 60000,
    },
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser testing and automation by Microsoft',
    icon: <PlaywrightLogo className="h-8 w-8" />,
    config: {
      name: 'Playwright',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
      toolPrefix: 'playwright',
      timeout: 60000,
    },
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Error tracking and performance monitoring',
    icon: <SentryLogo className="h-8 w-8" />,
    config: {
      name: 'Sentry',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sentry'],
      toolPrefix: 'sentry',
      timeout: 30000,
    },
    envVars: [
      { key: 'SENTRY_AUTH_TOKEN', description: 'Sentry authentication token', required: true },
      { key: 'SENTRY_ORG', description: 'Sentry organization slug', required: true },
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issue tracking and project management',
    icon: <LinearLogo className="h-8 w-8" />,
    config: {
      name: 'Linear',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-linear'],
      toolPrefix: 'linear',
      timeout: 30000,
    },
    envVars: [
      { key: 'LINEAR_API_KEY', description: 'Linear API key', required: true },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Send messages and manage Discord servers',
    icon: <DiscordLogo className="h-8 w-8" />,
    config: {
      name: 'Discord',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@mcp-servers/discord'],
      toolPrefix: 'discord',
      timeout: 30000,
    },
    envVars: [
      { key: 'DISCORD_BOT_TOKEN', description: 'Discord bot token', required: true },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Send messages via Telegram bot',
    icon: <TelegramLogo className="h-8 w-8" />,
    config: {
      name: 'Telegram',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-telegram'],
      toolPrefix: 'telegram',
      timeout: 30000,
    },
    envVars: [
      { key: 'TELEGRAM_BOT_TOKEN', description: 'Telegram bot token from @BotFather', required: true },
    ],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Read and write Airtable databases',
    icon: <AirtableLogo className="h-8 w-8" />,
    config: {
      name: 'Airtable',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@domdomegg/airtable-mcp-server'],
      toolPrefix: 'airtable',
      timeout: 30000,
    },
    envVars: [
      { key: 'AIRTABLE_API_KEY', description: 'Airtable personal access token', required: true },
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Control playback and browse music',
    icon: <SpotifyLogo className="h-8 w-8" />,
    config: {
      name: 'Spotify',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-spotify'],
      toolPrefix: 'spotify',
      timeout: 30000,
    },
    envVars: [
      { key: 'SPOTIFY_CLIENT_ID', description: 'Spotify app client ID', required: true },
      { key: 'SPOTIFY_CLIENT_SECRET', description: 'Spotify app client secret', required: true },
      { key: 'SPOTIFY_REFRESH_TOKEN', description: 'Spotify OAuth refresh token', required: true },
    ],
  },
  {
    id: 'everart',
    name: 'EverArt',
    description: 'AI image generation with multiple models',
    icon: <EverArtLogo className="h-8 w-8" />,
    config: {
      name: 'EverArt',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everart'],
      toolPrefix: 'everart',
      timeout: 60000,
    },
    envVars: [
      { key: 'EVERART_API_KEY', description: 'EverArt API key', required: true },
    ],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch and parse web content',
    icon: <FetchLogo className="h-8 w-8 text-blue-600" />,
    config: {
      name: 'Fetch',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
      toolPrefix: 'fetch',
      timeout: 30000,
    },
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Dynamic problem-solving through thought sequences',
    icon: <SequentialThinkingLogo className="h-8 w-8 text-indigo-600" />,
    config: {
      name: 'Sequential Thinking',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      toolPrefix: 'think',
      timeout: 60000,
    },
  },
];

export function MCPServersSettings() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<MCPServerStatus[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [serversRes, enabledRes, statusRes] = await Promise.all([
        api.get('/api/settings/mcp.servers'),
        api.get('/api/settings/mcp.enabled'),
        api.get('/api/settings/mcp/status').catch(() => ({ success: false })),
      ]);

      if (serversRes?.success) {
        setServers(serversRes.data.value || []);
      }
      if (enabledRes?.success) {
        setEnabled(enabledRes.data.value);
      }
      if (statusRes?.success && statusRes.data?.servers) {
        setServerStatus(statusRes.data.servers);
      }
    } catch (error) {
      toast.error('Failed to load MCP settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await api.put('/api/settings/batch', {
        'mcp.servers': servers,
        'mcp.enabled': enabled,
      });

      // Show feedback about MCP refresh
      if (result?.mcpRefresh) {
        const { added, removed, total } = result.mcpRefresh;
        if (added > 0 || removed > 0) {
          toast.success(`MCP updated: ${added} connected, ${removed} disconnected (${total} total)`);
        } else {
          toast.success('MCP settings saved');
        }
      } else {
        toast.success('MCP settings saved');
      }

      // Reload status immediately (connections are already refreshed)
      await loadSettings();
    } catch (error) {
      toast.error('Failed to save MCP settings');
    } finally {
      setSaving(false);
    }
  };

  const addServer = () => {
    const newServer: MCPServerConfig = {
      id: `mcp-${Date.now()}`,
      name: 'New MCP Server',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y'],
      timeout: 30000,
    };
    setServers([...servers, newServer]);
  };

  const addFromTemplate = (template: MCPTemplate) => {
    // Check if already added
    const exists = servers.some(
      (s) => s.toolPrefix === template.config.toolPrefix || s.name === template.config.name
    );
    if (exists) {
      toast.error(`${template.name} is already configured`);
      return;
    }

    const newServer: MCPServerConfig = {
      id: `mcp-${template.id}-${Date.now()}`,
      enabled: true,
      ...template.config,
      env: template.envVars?.reduce((acc, v) => ({ ...acc, [v.key]: '' }), {}),
    };
    setServers([...servers, newServer]);
    toast.success(`Added ${template.name} - configure and save to connect`);
  };

  const getAvailableTemplates = () => {
    return MCP_TEMPLATES.filter(
      (t) => !servers.some((s) => s.toolPrefix === t.config.toolPrefix || s.name === t.config.name)
    );
  };

  const removeServer = (id: string) => {
    setServers(servers.filter((s) => s.id !== id));
  };

  const updateServer = (id: string, updates: Partial<MCPServerConfig>) => {
    setServers(servers.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const testConnection = async (server: MCPServerConfig) => {
    setTesting(server.id);
    try {
      const result = await api.post('/api/settings/mcp/test', server);
      if (result?.success && result.data?.success) {
        toast.success(
          `Connected! Found ${result.data.tools?.length || 0} tools: ${result.data.tools?.join(', ') || 'none'}`
        );
      } else {
        toast.error(result.data?.error || 'Connection failed');
      }
    } catch (error) {
      toast.error('Failed to test connection');
    } finally {
      setTesting(null);
    }
  };

  const getStatusBadge = (serverId: string) => {
    const status = serverStatus.find((s) => s.id === serverId);
    if (!status) return null;

    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      connected: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
      connecting: { variant: 'secondary', icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" /> },
      reconnecting: { variant: 'secondary', icon: <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> },
      error: { variant: 'destructive', icon: <XCircle className="h-3 w-3 mr-1" /> },
      disconnected: { variant: 'outline', icon: null },
    };

    const { variant, icon } = variants[status.status] || variants.disconnected;

    return (
      <Badge variant={variant} className="ml-2">
        {icon}
        {status.status}
        {status.toolCount > 0 && ` (${status.toolCount} tools)`}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <CardTitle>MCP Servers</CardTitle>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <CardDescription>
          Connect to Model Context Protocol servers to extend the AI agent with external tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>MCP integration is disabled</p>
            <p className="text-sm">Enable it above to configure MCP servers</p>
          </div>
        ) : (
          <>
            {/* Quick Add Templates */}
            {getAvailableTemplates().length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Quick Add</Label>
                  <span className="text-xs text-muted-foreground">
                    {getAvailableTemplates().length} templates available
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {getAvailableTemplates().map((template) => (
                    <Button
                      key={template.id}
                      variant="outline"
                      size="sm"
                      className="h-auto py-2 px-3 flex flex-col items-center gap-1 hover:bg-accent"
                      onClick={() => addFromTemplate(template)}
                    >
                      <div className="text-muted-foreground">{template.icon}</div>
                      <span className="text-xs font-medium">{template.name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {servers.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                <Server className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">No MCP servers configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click a template above or add a custom server
                </p>
                <Button variant="outline" onClick={addServer} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Custom Server
                </Button>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {servers.map((server, index) => (
                  <AccordionItem
                    key={server.id}
                    value={server.id}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2 text-left">
                        {server.transport === 'stdio' ? (
                          <Terminal className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{server.name}</span>
                        {getStatusBadge(server.id)}
                        {!server.enabled && (
                          <Badge variant="outline" className="ml-2">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Server Name</Label>
                          <Input
                            value={server.name}
                            onChange={(e) =>
                              updateServer(server.id, { name: e.target.value })
                            }
                            placeholder="My MCP Server"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Transport Type</Label>
                          <Select
                            value={server.transport}
                            onValueChange={(value: 'stdio' | 'http') =>
                              updateServer(server.id, { transport: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stdio">
                                <div className="flex items-center gap-2">
                                  <Terminal className="h-4 w-4" />
                                  Stdio (Local)
                                </div>
                              </SelectItem>
                              <SelectItem value="http">
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4" />
                                  HTTP (Remote)
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {server.transport === 'stdio' ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Command</Label>
                            <Input
                              value={server.command || ''}
                              onChange={(e) =>
                                updateServer(server.id, { command: e.target.value })
                              }
                              placeholder="npx"
                            />
                            <p className="text-xs text-muted-foreground">
                              e.g., npx, node, python
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>Arguments</Label>
                            <Input
                              value={(server.args || []).join(' ')}
                              onChange={(e) =>
                                updateServer(server.id, {
                                  args: e.target.value.split(' ').filter(Boolean),
                                })
                              }
                              placeholder="-y @anthropic/mcp-server-github"
                            />
                            <p className="text-xs text-muted-foreground">
                              Space-separated arguments
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Server URL</Label>
                            <Input
                              value={server.url || ''}
                              onChange={(e) =>
                                updateServer(server.id, { url: e.target.value })
                              }
                              placeholder="https://mcp.example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>API Key (optional)</Label>
                            <Input
                              type="password"
                              value={server.apiKey || ''}
                              onChange={(e) =>
                                updateServer(server.id, { apiKey: e.target.value })
                              }
                              placeholder="sk-..."
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Tool Prefix (optional)</Label>
                          <Input
                            value={server.toolPrefix || ''}
                            onChange={(e) =>
                              updateServer(server.id, { toolPrefix: e.target.value })
                            }
                            placeholder="github"
                          />
                          <p className="text-xs text-muted-foreground">
                            Prefix for tool names to avoid conflicts
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Timeout (ms)</Label>
                          <Input
                            type="number"
                            value={server.timeout || 30000}
                            onChange={(e) =>
                              updateServer(server.id, {
                                timeout: parseInt(e.target.value) || 30000,
                              })
                            }
                          />
                        </div>
                      </div>

                      {/* Environment Variables */}
                      {server.transport === 'stdio' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Environment Variables</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newEnv = { ...(server.env || {}), '': '' };
                                updateServer(server.id, { env: newEnv });
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </div>
                          {server.env && Object.keys(server.env).length > 0 ? (
                            <div className="space-y-2">
                              {Object.entries(server.env).map(([key, value], idx) => (
                                <div key={idx} className="flex gap-2">
                                  <Input
                                    className="flex-1"
                                    placeholder="VARIABLE_NAME"
                                    value={key}
                                    onChange={(e) => {
                                      const newEnv = { ...server.env };
                                      delete newEnv[key];
                                      newEnv[e.target.value] = value;
                                      updateServer(server.id, { env: newEnv });
                                    }}
                                  />
                                  <Input
                                    className="flex-1"
                                    type="password"
                                    placeholder="value"
                                    value={value}
                                    onChange={(e) => {
                                      const newEnv = { ...server.env, [key]: e.target.value };
                                      updateServer(server.id, { env: newEnv });
                                    }}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const newEnv = { ...server.env };
                                      delete newEnv[key];
                                      updateServer(server.id, { env: newEnv });
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No environment variables configured
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={server.enabled}
                            onCheckedChange={(checked) =>
                              updateServer(server.id, { enabled: checked })
                            }
                          />
                          <Label>Enabled</Label>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnection(server)}
                            disabled={testing === server.id}
                          >
                            {testing === server.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4 mr-2" />
                            )}
                            Test
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Server?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove &quot;{server.name}&quot; from your MCP
                                  configuration. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeServer(server.id)}
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            {servers.length > 0 && (
              <Button variant="outline" onClick={addServer} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Another Server
              </Button>
            )}
          </>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default MCPServersSettings;
