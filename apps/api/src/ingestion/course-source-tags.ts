// Provider labels are optional and are matched only against existing master skills.
export function sourceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value.flatMap((item: any) => {
    const label =
      typeof item === 'string'
        ? item
        : item?.label?.display_name ??
          item?.label?.title ??
          item?.display_name ??
          item?.title ??
          item?.name;
    return typeof label === 'string' && label.trim() ? [label.trim()] : [];
  });
  return [...new Map(tags.map((tag) => [tag.toLowerCase(), tag])).values()];
}

export function udemySourceTags(course: any): string[] {
  return sourceTags([
    ...sourceTags(course.tags),
    ...sourceTags(course.topics),
    ...sourceTags(course.course_has_labels),
    course.primary_topic,
    course.primary_category,
    course.primary_subcategory,
  ]);
}
