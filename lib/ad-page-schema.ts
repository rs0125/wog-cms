import type initialContent from '@/content/ad-pages/bangalore.json';
import { parseAdPage } from './ad-page-content.mjs';

export type AdPageContent = typeof initialContent;
export type AdPageCopyKey = keyof AdPageContent['copy'];
export type AdPageImageKey = keyof AdPageContent['images'];
export const AD_PAGES = { bangalore: 'Bangalore' } as const;
// Cards the website stopped showing on 19 Oct 2026. The slots stay in the
// contract so saved pages remain valid; the editor no longer offers them.
export const AD_RETIRED_IMAGES: readonly string[] = ['featured-967', 'featured-408', 'featured-1226', 'warehouse-1398', 'warehouse-612', 'warehouse-2429', 'warehouse-1196', 'warehouse-1697', 'warehouse-1222'];
export const isAdPageSlug = (slug: string): slug is keyof typeof AD_PAGES => Object.hasOwn(AD_PAGES, slug);
export function readAdPage(value: unknown, draft = false): AdPageContent {
  return parseAdPage(value, { draft }) as AdPageContent;
}

export const AD_COPY_GROUPS: { id: string; title: string; hint?: string; fields: { key: AdPageCopyKey; label: string; multiline?: boolean }[] }[] = [
  { id: 'settings', title: 'Page settings', fields: [
    { key: 'seoTitle', label: 'Browser title' }, { key: 'metaDescription', label: 'Page description', multiline: true },
  ] },
  { id: 'hero', title: 'Hero', fields: [
    { key: 'heroHeading', label: 'Heading' }, { key: 'heroAccent', label: 'Heading, coloured ending' },
  ] },
  { id: 'enquiry', title: 'Hero enquiry form', fields: [
    { key: 'enquiryHeading', label: 'Hero form heading' }, { key: 'enquiryDescription', label: 'Hero form description', multiline: true }, { key: 'enquirySubmit', label: 'Submit button' },
  ] },
  { id: 'featured', title: 'Featured warehouses', hint: 'Each card uses its warehouse’s photo under Available warehouses, or its catalogue photo.', fields: [{ key: 'featuredHeading', label: 'Section heading' }] },
  { id: 'why', title: 'Why choose WareOnGo', fields: [{ key: 'whyHeading', label: 'Section heading' }] },
  { id: 'available', title: 'Available warehouses · desktop only', hint: 'This section is hidden below 768px. Featured warehouses still appear on mobile. The website sets the size filters after All sizes.', fields: [
    { key: 'availableHeading', label: 'Section heading' },
    { key: 'filterAll', label: 'All sizes filter' },
    { key: 'availableFooter', label: 'Footer copy — {listings} inserts the current listing count', multiline: true }, { key: 'availableCta', label: 'Footer button' },
  ] },
  { id: 'locations', title: 'Micromarkets and map', fields: [
    { key: 'locationsHeading', label: 'Section heading' }, { key: 'locationsCta', label: 'Card button' }, { key: 'mapLabel', label: 'Map label' }, { key: 'mapCaption', label: 'Map caption (desktop only)' },
  ] },
  { id: 'areas', title: 'Which area fits you', fields: [
    { key: 'areaHeading', label: 'Section heading' }, { key: 'areaNeedHeading', label: 'Needs column heading' }, { key: 'areaLocationsHeading', label: 'Areas column heading' },
  ] },
  { id: 'request', title: 'Dark enquiry strip', fields: [
    { key: 'requestHeading', label: 'Heading' }, { key: 'requestDescription', label: 'Description', multiline: true }, { key: 'requestDetails', label: 'Supporting line', multiline: true }, { key: 'requestCta', label: 'Request button' }, { key: 'requestPhoneCta', label: 'Phone button' },
  ] },
  { id: 'services', title: 'Our services', fields: [{ key: 'servicesHeading', label: 'Section heading' }] },
  { id: 'audiences', title: 'Who we serve', fields: [{ key: 'audiencesHeading', label: 'Section heading' }] },
  { id: 'rent', title: 'Warehouse rent guide', fields: [
    { key: 'rentHeading', label: 'Section heading' }, { key: 'rentAreaHeading', label: 'Area column heading' },
    { key: 'rentRateHeading', label: 'Rent column heading' }, { key: 'rentUnit', label: 'Rent unit' },
  ] },
  { id: 'faqs', title: 'Frequently asked questions', fields: [{ key: 'faqHeading', label: 'Section heading' }] },
  { id: 'enquiry-success', title: 'Hero form · thank-you state', hint: 'Choose “Hero thank-you” in Preview to review these messages without sending an enquiry.', fields: [
    { key: 'enquirySuccessHeading', label: 'Thank-you heading' }, { key: 'enquirySuccessDescription', label: 'Thank-you message', multiline: true }, { key: 'enquirySuccessCta', label: 'Thank-you link' },
  ] },
  { id: 'contact', title: 'Contact dialog', hint: 'Choose “Contact dialog” in Preview to review the form opened by the page buttons.', fields: [
    { key: 'contactHeading', label: 'Contact dialog heading' }, { key: 'contactDescription', label: 'Contact dialog description', multiline: true },
  ] },
  { id: 'contact-success', title: 'Contact dialog · success notification', hint: 'Choose “Contact thank-you” in Preview to review the notification shown after an enquiry.', fields: [
    { key: 'contactSuccess', label: 'Contact thank-you message', multiline: true },
  ] },
];
