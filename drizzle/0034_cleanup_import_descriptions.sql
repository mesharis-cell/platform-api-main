-- Preview rows that match the imported source/docExternalKey description blob.
select 'assets' as table_name, count(*) as matching_rows
from assets
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$'
union all
select 'asset_families' as table_name, count(*) as matching_rows
from asset_families
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$';

-- Optional: inspect a few matching rows before applying.
select 'assets' as table_name, id, name, description
from assets
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$'
limit 20;

select 'asset_families' as table_name, id, name, description
from asset_families
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$'
limit 20;

-- Apply: clear only descriptions that exactly match the import blob pattern.
update assets
set
    description = null,
    updated_at = now()
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$';

update asset_families
set
    description = null,
    updated_at = now()
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$';

-- Verify after apply.
select 'assets' as table_name, count(*) as remaining_rows
from assets
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$'
union all
select 'asset_families' as table_name, count(*) as remaining_rows
from asset_families
where description ~ E'^Source: .*\\n\\[docExternalKey:.*\\]$';
