local obs = obslua
local ffi = require('ffi')
ffi.cdef('int getpid(void);')

local project = ''
local node_bin = ''
local source_name = ''
local last_launch = 0

local function quote(value)
    return "'" .. value:gsub("'", "'\\''") .. "'"
end

local function launch()
    -- Activation signals can arrive together during scene transitions.
    if os.time() - last_launch < 2 then return end
    last_launch = os.time()
    local command = '/usr/bin/python3 ' .. quote(script_path() .. 'runner.py')
        .. ' --project ' .. quote(project)
        .. ' --node-bin ' .. quote(node_bin)
        .. ' --owner-pid ' .. tostring(ffi.C.getpid())
    -- Only shell startup runs synchronously; npm never blocks the OBS UI.
    os.execute(command .. ' </dev/null >/dev/null 2>&1 &')
end

local function on_activate(data)
    local source = obs.calldata_source(data, 'source')
    if source and obs.obs_source_get_name(source) == source_name then launch() end
end

local function check_active()
    obs.timer_remove(check_active)
    local source = obs.obs_get_source_by_name(source_name)
    if source then
        if obs.obs_source_active(source) then launch() end
        obs.obs_source_release(source)
    end
end

function script_description()
    return 'Запускает npm start при показе источника «Акции». Один процесс на проект; '
        .. 'продолжает работать при переключении сцен и останавливается после закрытия OBS. '
        .. 'Лог: logs/obs-autostart.log в папке проекта.'
end

function script_defaults(settings)
    obs.obs_data_set_default_string(settings, 'source_name', 'Акции')
    obs.obs_data_set_default_string(settings, 'project',
        os.getenv('HOME') .. '/Documents/Projects/pet-projects/stock-background')
    obs.obs_data_set_default_string(settings, 'node_bin', '/opt/homebrew/bin')
end

function script_properties()
    local props = obs.obs_properties_create()
    obs.obs_properties_add_text(props, 'source_name', 'Имя источника', obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_path(props, 'project', 'Папка проекта', obs.OBS_PATH_DIRECTORY, nil, nil)
    obs.obs_properties_add_path(props, 'node_bin', 'Папка с node и npm', obs.OBS_PATH_DIRECTORY, nil, nil)
    return props
end

function script_update(settings)
    source_name = obs.obs_data_get_string(settings, 'source_name')
    project = obs.obs_data_get_string(settings, 'project')
    node_bin = obs.obs_data_get_string(settings, 'node_bin')
end

function script_load(settings)
    script_update(settings)
    obs.signal_handler_connect(obs.obs_get_signal_handler(), 'source_activate', on_activate)
    -- Also cover an already-visible source when OBS loads the collection.
    obs.timer_add(check_active, 5000)
end

function script_unload()
    obs.signal_handler_disconnect(obs.obs_get_signal_handler(), 'source_activate', on_activate)
    obs.timer_remove(check_active)
end
