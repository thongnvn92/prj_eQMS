<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class LauncherAuthSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            DepartmentsSeeder::class,
            UsersSeeder::class,
        ]);
    }
}
